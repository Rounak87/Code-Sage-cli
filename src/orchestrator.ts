import { generateText, generateObject, tool } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { getGitDiff, getFileContent, getGitRoot, ChangedFile } from './git.js';
import { fetchFileContent, searchCodebase, listDirectory } from './tools.js';

// Load model from environment variables
const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const googleProvider = google(modelName);

export interface ReviewComment {
  filePath: string;
  line: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  category: 'Security' | 'Performance' | 'Logic' | 'Style';
  title: string;
  problem: string;
  whyItMatters: string;
  consequences: string;
  suggestedPatch?: string;
  confidence: number;
}

export interface ReviewState {
  repoRoot: string;
  languages: string[];
  dependencies: string[];
  changedFiles: ChangedFile[];
  plannerGoals?: string;
  comments: ReviewComment[];
}

/**
 * Builds codebase metadata (dependencies, languages) by scanning the root folder.
 */
function buildCodebaseMetadata(root: string): { languages: string[]; dependencies: string[] } {
  const languages = new Set<string>();
  const dependencies: string[] = [];

  try {
    if (fs.existsSync(path.join(root, 'package.json'))) {
      languages.add('JavaScript/TypeScript');
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      dependencies.push(...Object.keys(deps));
    }

    if (fs.existsSync(path.join(root, 'requirements.txt'))) {
      languages.add('Python');
      const lines = fs.readFileSync(path.join(root, 'requirements.txt'), 'utf-8').split('\n');
      lines.forEach(l => {
        const cleaned = l.trim().split(/[==,>=,<=]/)[0].trim();
        if (cleaned && !cleaned.startsWith('#')) {
          dependencies.push(cleaned);
        }
      });
    }

    if (fs.existsSync(path.join(root, 'go.mod'))) {
      languages.add('Go');
    }

    if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
      languages.add('Rust');
    }
  } catch {
    // Fail silently, metadata is helper only
  }

  return {
    languages: Array.from(languages),
    dependencies: dependencies.slice(0, 50) // Cap to avoid token bloat
  };
}

/**
 * Stage 2: Runs the Planner Agent to generate a review strategy.
 */
async function runPlanner(state: ReviewState): Promise<{ overallGoals: string; fileScopes: Record<string, { skip: boolean; focus: string[]; reason: string }> }> {
  const filesList = state.changedFiles.map(f => ({
    path: f.path,
    isNew: f.isNew,
    linesAdded: f.chunks.reduce((sum, c) => sum + c.addedLines.length, 0)
  }));

  const systemPrompt = `You are a Senior Project Manager and Technical Architect.
Your task is to analyze the list of modified files in a commit and draft a structured review plan.
Determine which files need a deep review, which files need a light check (e.g. style/config), and which files can be skipped (e.g. lockfiles, assets, auto-generated files).
Define key focus areas for the reviewers.`;

  const userPrompt = `Project Context:
- Languages detected: ${state.languages.join(', ')}
- Core dependencies: ${state.dependencies.join(', ')}

Modified files in this commit:
${JSON.stringify(filesList, null, 2)}

Provide a plan containing:
1. Overall review goals.
2. A list of file scopes mapping each file path to its skip status, focus areas, and reason.`;

  const response = await generateObject({
    model: googleProvider,
    schema: z.object({
      overallGoals: z.string().describe('The primary engineering focus for this review run.'),
      files: z.array(z.object({
        path: z.string().describe('The exact file path.'),
        skip: z.boolean().describe('Whether this file should be skipped entirely from review.'),
        focus: z.array(z.string()).describe('List of specific issues to focus on for this file (e.g., security, edge cases, error handling).'),
        reason: z.string().describe('Brief reason for this plan.')
      }))
    }),
    system: systemPrompt,
    prompt: userPrompt
  });

  const fileScopes: Record<string, { skip: boolean; focus: string[]; reason: string }> = {};
  response.object.files.forEach(f => {
    fileScopes[f.path] = { skip: f.skip, focus: f.focus, reason: f.reason };
  });

  return {
    overallGoals: response.object.overallGoals,
    fileScopes
  };
}

/**
 * Stage 3: Runs individual reviews on modified files in parallel.
 */
async function runFileReview(
  file: ChangedFile,
  scope: { skip: boolean; focus: string[]; reason: string },
  state: ReviewState
): Promise<ReviewComment[]> {
  if (scope.skip) {
    return [];
  }

  const fileContent = getFileContent(file.path, state.repoRoot) || '';

  const systemPrompt = `You are a pragmatic, highly experienced Senior Software Architect.
Your job is to review the code changes and identify bugs, security vulnerabilities, performance bottlenecks, or poor engineering choices.

CRITICAL RULES:
1. Do not complain about style, formatting, or missing comments unless they severely impact readability.
2. Be encouraging but direct. Explain the engineering rationale behind every critique.
3. Your suggestions must be educational, explaining the core concepts, why they matter, and what consequences the current implementation will have in production.
4. ONLY comment on the lines that were added/modified in the diff. Check the line numbers in the diff carefully.
5. Provide a suggestedPatch ONLY if it is a clear, concise replacement for the exact lines modified.`;

  const userPrompt = `Review Plan for this file:
Focus Areas: ${scope.focus.join(', ')}
Reasoning: ${scope.reason}

File Name: ${file.path}

Full File Content:
\`\`\`
${fileContent}
\`\`\`

Git Diff for this file (lines prefixed with '+' are added/modified):
\`\`\`diff
${file.diff}
\`\`\`

Review the diff. Output a JSON object containing comments. Verify that each comment's "line" property matches one of the line numbers in the added lines of the diff.`;

  try {
    const response = await generateObject({
      model: googleProvider,
      schema: z.object({
        comments: z.array(z.object({
          line: z.number().describe('The line number in the modified file where the issue occurs.'),
          severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          category: z.enum(['Security', 'Performance', 'Logic', 'Style']),
          title: z.string().describe('Short descriptive title of the issue.'),
          problem: z.string().describe('Detailed description of the issue in the code.'),
          whyItMatters: z.string().describe('Educational explanation of the programming/security theory.'),
          consequences: z.string().describe('What negative impact this could have in production.'),
          suggestedPatch: z.string().optional().describe('Complete code snippet replacement to resolve the issue.')
        }))
      }),
      system: systemPrompt,
      prompt: userPrompt
    });

    // Map response to ReviewComment interface
    return response.object.comments.map(c => ({
      filePath: file.path,
      line: c.line,
      severity: c.severity,
      category: c.category,
      title: c.title,
      problem: c.problem,
      whyItMatters: c.whyItMatters,
      consequences: c.consequences,
      suggestedPatch: c.suggestedPatch,
      confidence: 0.90 // Default confidence from direct review
    }));
  } catch (error: any) {
    console.error(`Failed to review file ${file.path}:`, error.message);
    return [];
  }
}

/**
 * Stage 4: Run the Cross-File Agent using Gemini Tool calling loop.
 */
async function runCrossFileAgent(state: ReviewState): Promise<ReviewComment[]> {
  const crossFileComments: ReviewComment[] = [];

  const systemPrompt = `You are a Systems Architect reviewing a changeset. You have a list of file review reports.
Your goal is to investigate cross-file discrepancies and dependencies.
Examples of what to look for:
- Did a DB schema/model change? Check if queries or migrations in other files match.
- Did an exported function signature change? Check if other consumers are calling it with correct arguments.
- Was a new config/env variable introduced? Check if the template files (.env.example) were updated.

Use your tools (\`fetchFileContent\`, \`searchCodebase\`, \`listDirectory\`) to inspect files in the codebase that were NOT changed in the diff.
If you find a genuine discrepancy, report it using the \`reportFinding\` tool.
Only report high-confidence discrepancies. Explain why they are broken and the consequences.`;

  const userPrompt = `Project Context:
- Languages: ${state.languages.join(', ')}
- Core Dependencies: ${state.dependencies.join(', ')}

Changed Files in this commit:
${state.changedFiles.map(f => f.path).join(', ')}

Review comments found so far in modified files:
${JSON.stringify(state.comments, null, 2)}

Investigate the codebase for any secondary effects or inconsistencies caused by these changes. Call tools to search or read files as needed. When you find an issue, use the \`reportFinding\` tool to record it.`;

  await generateText({
    model: googleProvider,
    maxSteps: 8, // Set a safe max loop count
    system: systemPrompt,
    prompt: userPrompt,
    tools: {
      fetchFileContent: tool({
        description: 'Read the contents of a file in the workspace.',
        parameters: z.object({ path: z.string().describe('File path relative to the repository root.') }),
        execute: async ({ path: filePath }) => {
          return fetchFileContent(filePath, state.repoRoot);
        }
      }),
      searchCodebase: tool({
        description: 'Search the codebase for a text query (grep).',
        parameters: z.object({ query: z.string().describe('Text query or function name to search for.') }),
        execute: async ({ query }) => {
          return searchCodebase(query, state.repoRoot);
        }
      }),
      listDirectory: tool({
        description: 'List items in a workspace folder.',
        parameters: z.object({ path: z.string().describe('Directory path relative to the repository root.') }),
        execute: async ({ path: dirPath }) => {
          return listDirectory(dirPath, state.repoRoot);
        }
      }),
      reportFinding: tool({
        description: 'Report a cross-file discrepancy or security/logical bug discovered in your investigation.',
        parameters: z.object({
          filePath: z.string().describe('The file path containing the broken or inconsistent code.'),
          line: z.number().describe('Approximate line number where the inconsistency resides.'),
          severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          category: z.enum(['Security', 'Performance', 'Logic', 'Style']),
          title: z.string().describe('Short descriptive title of the cross-file issue.'),
          problem: z.string().describe('Detailed description of the discrepancy.'),
          whyItMatters: z.string().describe('Educational explanation of the core concept.'),
          consequences: z.string().describe('What will fail in production if this inconsistency is merged.'),
          suggestedPatch: z.string().optional().describe('Code suggestion to resolve the issue.')
        }),
        execute: async (finding) => {
          crossFileComments.push({
            ...finding,
            confidence: 0.85
          });
          return `Finding successfully recorded in file: ${finding.filePath}`;
        }
      })
    }
  });

  return crossFileComments;
}

/**
 * Main Orchestrator Execution Pipeline.
 */
export async function runReviewPipeline(
  diffMode: 'staged' | 'unstaged' | 'all' = 'all',
  cwd: string = process.cwd()
): Promise<ReviewState> {
  const root = getGitRoot(cwd);
  const metadata = buildCodebaseMetadata(root);
  const changedFiles = getGitDiff(diffMode, root);

  const state: ReviewState = {
    repoRoot: root,
    languages: metadata.languages,
    dependencies: metadata.dependencies,
    changedFiles,
    comments: []
  };

  if (changedFiles.length === 0) {
    return state;
  }

  // 1. Run Planner
  const plan = await runPlanner(state);
  state.plannerGoals = plan.overallGoals;

  // 2. Run File Reviewers in Parallel
  const fileReviews = await Promise.all(
    changedFiles.map(file => runFileReview(file, plan.fileScopes[file.path] || { skip: false, focus: [], reason: '' }, state))
  );

  // Flatten comments from all files
  state.comments = fileReviews.flat();

  // 3. Run Cross-File Reasoner Agent
  const crossFileComments = await runCrossFileAgent(state);
  state.comments.push(...crossFileComments);

  return state;
}

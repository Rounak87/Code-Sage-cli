import { generateText, generateObject, tool } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { getGitDiff, getFileContent, getGitRoot, ChangedFile } from './git.js';
import { fetchFileContent, searchCodebase, listDirectory } from './tools.js';

// Initialize custom Google Generative AI provider using the configured api key
const googleInstance = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
});

/**
 * Utility to execute LLM API calls with retry logic on 429 Rate Limit / Quota errors.
 */
async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 10000): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const errorMessage = (error && typeof error === 'object' && error.message) ? String(error.message) : '';
      const status = error && typeof error === 'object' ? (error.status || error.statusCode) : undefined;
      const isRateLimit = status === 429 || 
                          errorMessage.includes('429') || 
                          errorMessage.toLowerCase().includes('quota') ||
                          errorMessage.toLowerCase().includes('rate limit');
      
      if (isRateLimit && attempt <= retries) {
        let waitTime = delayMs;
        const match = errorMessage.match(/retry in (\d+(?:\.\d+)?)s/i);
        if (match) {
          waitTime = Math.ceil(parseFloat(match[1]) * 1000) + 3000; // Add 3 seconds safety buffer
        }
        console.warn(`\n⚠️ Rate limit or quota hit. Waiting ${(waitTime / 1000).toFixed(1)} seconds before retry attempt ${attempt}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Executes a generateObject call using the primary model. If that fails after retries,
 * it falls back to the backup model.
 */
async function generateObjectWithFallback(
  options: any
): Promise<any> {
  const primaryModelName = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const backupModelName = process.env.GEMINI_BACKUP_MODEL || 'gemini-2.5-flash-lite';
  
  const primaryProvider = googleInstance(primaryModelName);
  const backupProvider = googleInstance(backupModelName);

  try {
    return await callWithRetry(() => generateObject({
      ...options,
      model: primaryProvider
    }));
  } catch (primaryError: any) {
    console.warn(`\n⚠️ Primary model (${primaryModelName}) failed: ${primaryError.message}. Falling back to backup model (${backupModelName})...`);
    return await callWithRetry(() => generateObject({
      ...options,
      model: backupProvider
    }));
  }
}

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

  const response = await generateObjectWithFallback({
    maxRetries: 0,
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
  response.object.files.forEach((f: any) => {
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
    const response = await generateObjectWithFallback({
      maxRetries: 0,
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
    return response.object.comments.map((c: any) => ({
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
 * Utility to recursively read relevant files in the workspace asynchronously.
 */
async function gatherCodebaseContext(root: string): Promise<string> {
  let context = '';
  const visited = new Set<string>();
  let limitReached = false;
  
  const MAX_FILE_SIZE_BYTES = 50000; // 50KB limit
  const MAX_TOTAL_CONTEXT_BYTES = 500000; // 500KB limit

  async function scan(dir: string): Promise<void> {
    if (limitReached) return;
    
    let items: string[];
    try {
      items = await fs.promises.readdir(dir);
    } catch (error: any) {
      console.warn(`⚠️ Skipped reading directory ${dir}: ${error.message}`);
      return;
    }

    for (const item of items) {
      if (limitReached) break;
      
      const fullPath = path.join(dir, item);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
      
      // Exclude list
      if (
        item.startsWith('.') ||
        item === 'node_modules' ||
        item === 'dist' ||
        item === 'package-lock.json' ||
        item.endsWith('.png') ||
        item.endsWith('.jpg') ||
        item.endsWith('.ico') ||
        relativePath === 'REVIEW_REPORT.md' ||
        relativePath === 'REVIEW_REPORT.html' ||
        relativePath === 'PROJECT_PLAN.md' ||
        relativePath === 'ARCHITECTURE.md'
      ) {
        continue;
      }
      
      try {
        const stat = await fs.promises.lstat(fullPath);
        if (stat.isSymbolicLink()) {
          const realPath = await fs.promises.realpath(fullPath);
          if (visited.has(realPath)) continue;
          visited.add(realPath);
        }
        if (stat.isDirectory()) {
          await scan(fullPath);
        } else if (stat.isFile() && stat.size < MAX_FILE_SIZE_BYTES) {
          if (context.length > MAX_TOTAL_CONTEXT_BYTES) {
            console.warn('⚠️ Codebase context limit reached. Skipping remaining files.');
            limitReached = true;
            break;
          }
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          context += `\n--- File: ${relativePath} ---\n${content}\n`;
        }
      } catch (error: any) {
        console.warn(`⚠️ Skipped file/symlink ${relativePath}: ${error.message}`);
      }
    }
  }
  
  await scan(root);
  return context;
}

/**
 * Stage 4: Run the Cross-File Reasoner Agent (static context analysis).
 */
async function runCrossFileAgent(state: ReviewState): Promise<ReviewComment[]> {
  const systemPrompt = `You are a Systems Architect reviewing a changeset.
Your goal is to inspect the codebase context and identify any cross-file inconsistencies or secondary defects caused by the modifications.
Examples of what to look for:
- Did a DB schema/model change? Check if queries or migrations in other files match.
- Did an exported function signature change? Check if other consumers are calling it with correct arguments.
- Was a new config/env variable introduced? Check if the template files (.env.example) were updated.

Provide a list of high-confidence discrepancies found in files that were NOT changed in the diff. Explain why they are broken and the consequences.`;

  const codebaseContext = await gatherCodebaseContext(state.repoRoot);

  const userPrompt = `Project Context:
- Languages: ${state.languages.join(', ')}
- Core Dependencies: ${state.dependencies.join(', ')}

Codebase Content (All relevant files):
${codebaseContext}

Changed Files in this commit:
${state.changedFiles.map(f => f.path).join(', ')}

Review comments found so far in modified files:
${JSON.stringify(state.comments, null, 2)}

Analyze the codebase content above and identify any secondary effects or inconsistencies caused by these changes in unmodified files. Output a JSON list of findings. Only report high-confidence issues.`;

  try {
    const response = await generateObjectWithFallback({
      maxRetries: 0,
      schema: z.object({
        findings: z.array(z.object({
          filePath: z.string().describe('The file path containing the broken or inconsistent code.'),
          line: z.number().describe('Approximate line number where the inconsistency resides.'),
          severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          category: z.enum(['Security', 'Performance', 'Logic', 'Style']),
          title: z.string().describe('Short descriptive title of the cross-file issue.'),
          problem: z.string().describe('Detailed description of the discrepancy.'),
          whyItMatters: z.string().describe('Educational explanation of the core concept.'),
          consequences: z.string().describe('What will fail in production if this inconsistency is merged.'),
          suggestedPatch: z.string().optional().describe('Code suggestion to resolve the issue.')
        }))
      }),
      system: systemPrompt,
      prompt: userPrompt
    });

    return response.object.findings.map((f: any) => ({
      ...f,
      confidence: 0.85
    }));
  } catch (error: any) {
    console.error("Failed to run cross-file reasoner:", error.message);
    return [];
  }
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

  const sleepWithCountdown = async (seconds: number, actionDescription: string) => {
    for (let i = seconds; i > 0; i--) {
      process.stdout.write(`\r⏳ ${actionDescription}... (${i}s remaining)   `);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    process.stdout.write(`\r✅ ${actionDescription}... Done!                             \n`);
  };

  // 1. Run Planner
  console.log(`📋 Running planner stage...`);
  const plan = await runPlanner(state);
  state.plannerGoals = plan.overallGoals;

  // 2. Run File Reviewers Sequentially with delays to respect the 5 RPM rate limit
  const fileReviews: ReviewComment[][] = [];
  for (let idx = 0; idx < changedFiles.length; idx++) {
    const file = changedFiles[idx];
    const scope = plan.fileScopes[file.path] || { skip: false, focus: [], reason: '' };
    if (!scope.skip) {
      await sleepWithCountdown(12, `Rate limit pause before reviewing ${file.path} (${idx + 1}/${changedFiles.length})`);
      console.log(`🔍 Reviewing ${file.path}...`);
      const review = await runFileReview(file, scope, state);
      fileReviews.push(review);
    } else {
      console.log(`⏭️ Skipping ${file.path} as per review plan.`);
    }
  }

  // Flatten comments from all files
  state.comments = fileReviews.flat();

  // 3. Run Cross-File Reasoner Agent
  await sleepWithCountdown(12, `Rate limit pause before running cross-file agent`);
  console.log(`🧠 Running cross-file dependency agent...`);
  const crossFileComments = await runCrossFileAgent(state);
  state.comments.push(...crossFileComments);

  return state;
}

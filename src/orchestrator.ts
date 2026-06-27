import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { getGitDiff, getFileContent, getGitRoot, ChangedFile } from './git.js';
import { fetchFileContent, searchCodebase, listDirectory } from './tools.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ASTAnalysis {
  exports: string[];
  imports: { [importedSymbol: string]: string };
  calls: string[];
}

interface FileGraphNode {
  filePath: string;
  exports: string[];
  imports: { [symbol: string]: string };
  calls: string[];
}

export interface CallGraph {
  [filePath: string]: FileGraphNode;
}

interface CallerContext {
  symbol: string;
  filePath: string;
  line: number;
  context: string;
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

export interface PipelineCallbacks {
  onPlannerDone?: (goals: string) => void;
  onFileStart?: (filePath: string, index: number, total: number) => void;
  onFileDone?: (filePath: string, count: number) => void;
  onFileSkipped?: (filePath: string) => void;
  onASTStart?: () => void;
  onASTDone?: (nodeCount: number) => void;
  onCrossFileStart?: (callerCount: number) => void;
  onCrossFileDone?: (count: number) => void;
  onCrossFileSkipped?: () => void;
}

export interface ReviewState {
  repoRoot: string;
  languages: string[];
  dependencies: string[];
  changedFiles: ChangedFile[];
  plannerGoals?: string;
  comments: ReviewComment[];
}

// ─── LangGraph State Schema ───────────────────────────────────────────────────

const GraphState = Annotation.Root({
  repoRoot:       Annotation<string>,
  diffMode:       Annotation<'staged' | 'unstaged' | 'all'>,
  languages:      Annotation<string[]>,
  dependencies:   Annotation<string[]>,
  changedFiles:   Annotation<ChangedFile[]>,
  fileScopes:     Annotation<Record<string, { skip: boolean; focus: string[]; reason: string }>>,
  plannerGoals:   Annotation<string>,
  callerContexts: Annotation<CallerContext[]>,
  comments:       Annotation<ReviewComment[]>({
    // Reducer merges comments from each node independently
    reducer: (existing: ReviewComment[], incoming: ReviewComment[]) => [...existing, ...incoming],
    default: () => []
  }),
  callbacks:      Annotation<PipelineCallbacks>,
});

type GraphStateType = typeof GraphState.State;

// ─── Gemini Provider ──────────────────────────────────────────────────────────

const googleInstance = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
});

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
        if (match) waitTime = Math.ceil(parseFloat(match[1]) * 1000) + 3000;
        console.warn(`\nRate limit hit. Waiting ${(waitTime / 1000).toFixed(1)}s before retry ${attempt}/${retries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
}

async function generateObjectWithFallback(options: any): Promise<any> {
  const primaryModelName = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const backupModelName  = process.env.GEMINI_BACKUP_MODEL || 'gemini-2.5-flash-lite';
  const primaryProvider  = googleInstance(primaryModelName);
  const backupProvider   = googleInstance(backupModelName);

  try {
    return await callWithRetry(() => generateObject({ ...options, model: primaryProvider }));
  } catch {
    console.warn(`\nPrimary model failed. Falling back to ${backupModelName}...`);
    return await callWithRetry(() => generateObject({ ...options, model: backupProvider }));
  }
}

// ─── AST Utilities ────────────────────────────────────────────────────────────

function analyzeFileAST(filePath: string, content: string): ASTAnalysis {
  const exports: string[] = [];
  const imports: { [importedSymbol: string]: string } = {};
  const calls: string[] = [];

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const hasExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (hasExport && node.name) exports.push(node.name.text);
    } else if (ts.isVariableStatement(node)) {
      const hasExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (hasExport) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) exports.push(decl.name.text);
        }
      }
    } else if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) exports.push(el.name.text);
      }
    }

    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
      if (moduleSpecifier && node.importClause) {
        if (node.importClause.name) imports[node.importClause.name.text] = moduleSpecifier;
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            for (const el of node.importClause.namedBindings.elements) imports[el.name.text] = moduleSpecifier;
          } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            imports[node.importClause.namedBindings.name.text] = moduleSpecifier;
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) calls.push(node.expression.text);
      else if (ts.isPropertyAccessExpression(node.expression)) calls.push(node.expression.name.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { exports, imports, calls };
}

async function buildCallGraph(root: string): Promise<CallGraph> {
  const graph: CallGraph = {};
  const visited = new Set<string>();

  async function scan(dir: string): Promise<void> {
    let items: string[];
    try { items = await fs.promises.readdir(dir); }
    catch { return; }

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');
      if (item.startsWith('.') || item === 'node_modules' || item === 'dist' || item === 'package-lock.json') continue;

      try {
        const stat = await fs.promises.lstat(fullPath);
        if (stat.isSymbolicLink()) {
          const realPath = await fs.promises.realpath(fullPath);
          if (visited.has(realPath)) continue;
          visited.add(realPath);
        }
        if (stat.isDirectory()) {
          await scan(fullPath);
        } else if (stat.isFile() && item.match(/\.(ts|js|tsx|jsx)$/)) {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          const analysis = analyzeFileAST(relativePath, content);
          graph[relativePath] = { filePath: relativePath, ...analysis };
        }
      } catch { /* skip unreadable files */ }
    }
  }

  await scan(root);
  return graph;
}

function matchesImport(specifier: string, importerPath: string, targetPath: string): boolean {
  try {
    const importerDir = path.dirname(importerPath);
    const resolvedSpecifier = path.resolve(importerDir, specifier).replace(/\\/g, '/');
    const resolvedTarget = path.resolve(targetPath).replace(/\\/g, '/');
    const stripExt = (p: string) => p.replace(/\.[a-zA-Z0-9]+$/, '');
    return stripExt(resolvedSpecifier) === stripExt(resolvedTarget);
  } catch { return false; }
}

function getModifiedExports(changedFile: ChangedFile, exports: string[]): string[] {
  const diffLines = changedFile.diff.split('\n');
  return exports.filter(exp => {
    const regex = new RegExp(`^[+-].*\\b${exp}\\b`);
    return diffLines.some(line => regex.test(line));
  });
}

async function getCallerContexts(importerPath: string, symbol: string, root: string): Promise<CallerContext[]> {
  const fullPath = path.join(root, importerPath);
  let content: string;
  try { content = await fs.promises.readFile(fullPath, 'utf-8'); }
  catch { return []; }

  const lines = content.split('\n');
  const contexts: CallerContext[] = [];
  const regex = new RegExp(`\\b${symbol}\\b`);

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      const start = Math.max(0, i - 4);
      const end = Math.min(lines.length - 1, i + 5);
      const snippet = lines.slice(start, end + 1).map((l, idx) => `${start + idx + 1}: ${l}`).join('\n');
      contexts.push({ symbol, filePath: importerPath, line: i + 1, context: snippet });
    }
  }
  return contexts;
}

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
      fs.readFileSync(path.join(root, 'requirements.txt'), 'utf-8').split('\n').forEach(l => {
        const cleaned = l.trim().split(/[==,>=,<=]/)[0].trim();
        if (cleaned && !cleaned.startsWith('#')) dependencies.push(cleaned);
      });
    }
    if (fs.existsSync(path.join(root, 'go.mod'))) languages.add('Go');
    if (fs.existsSync(path.join(root, 'Cargo.toml'))) languages.add('Rust');
  } catch { /* fail silently */ }
  return { languages: Array.from(languages), dependencies: dependencies.slice(0, 50) };
}

// ─── Graph Node Functions ─────────────────────────────────────────────────────

/**
 * Node: load_context
 * Reads git diff and codebase metadata. Entry point of the graph.
 */
async function nodeLoadContext(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const root = getGitRoot(process.cwd());
  const metadata = buildCodebaseMetadata(root);
  const changedFiles = getGitDiff(state.diffMode, root);
  return {
    repoRoot: root,
    languages: metadata.languages,
    dependencies: metadata.dependencies,
    changedFiles,
  };
}

/**
 * Node: planner
 * Calls Gemini to produce a structured per-file review plan.
 */
async function nodePlanner(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const filesList = state.changedFiles.map(f => ({
    path: f.path,
    isNew: f.isNew,
    linesAdded: f.chunks.reduce((sum, c) => sum + c.addedLines.length, 0)
  }));

  const response = await generateObjectWithFallback({
    maxRetries: 0,
    schema: z.object({
      overallGoals: z.string(),
      files: z.array(z.object({
        path: z.string(),
        skip: z.boolean(),
        focus: z.array(z.string()),
        reason: z.string()
      }))
    }),
    system: `You are a Senior Technical Architect. Analyze modified files and produce a structured review plan. Identify files to skip (lockfiles, assets, generated code) and define engineering focus areas for files that need review.`,
    prompt: `Languages: ${state.languages.join(', ')}\nDependencies: ${state.dependencies.join(', ')}\n\nModified files:\n${JSON.stringify(filesList, null, 2)}`
  });

  const fileScopes: Record<string, { skip: boolean; focus: string[]; reason: string }> = {};
  response.object.files.forEach((f: any) => {
    fileScopes[f.path] = { skip: f.skip, focus: f.focus, reason: f.reason };
  });

  state.callbacks?.onPlannerDone?.(response.object.overallGoals);

  return {
    plannerGoals: response.object.overallGoals,
    fileScopes,
  };
}

/**
 * Node: file_reviewer
 * Reviews each changed file sequentially. Comments are merged via reducer.
 */
async function nodeFileReviewer(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const newComments: ReviewComment[] = [];

  for (let idx = 0; idx < state.changedFiles.length; idx++) {
    const file = state.changedFiles[idx];
    const scope = state.fileScopes?.[file.path] || { skip: false, focus: [], reason: '' };

    if (scope.skip) {
      state.callbacks?.onFileSkipped?.(file.path);
      continue;
    }

    state.callbacks?.onFileStart?.(file.path, idx + 1, state.changedFiles.length);
    await sleep(12000);

    const fileContent = getFileContent(file.path, state.repoRoot) || '';
    try {
      const response = await generateObjectWithFallback({
        maxRetries: 0,
        schema: z.object({
          comments: z.array(z.object({
            line: z.number(),
            severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
            category: z.enum(['Security', 'Performance', 'Logic', 'Style']),
            title: z.string(),
            problem: z.string(),
            whyItMatters: z.string(),
            consequences: z.string(),
            suggestedPatch: z.string().optional()
          }))
        }),
        system: `You are a pragmatic Senior Software Architect performing a production code review.

ONLY report issues that meet ALL of the following criteria:
1. The issue represents a genuine BUG, SECURITY VULNERABILITY, PERFORMANCE BOTTLENECK, or LOGIC ERROR.
2. The issue could cause real harm in production: crashes, data loss, security exploits, race conditions, or incorrect behaviour.
3. You have high confidence the issue is actually wrong, not just a different style preference.

DO NOT report the following — return an empty comments array if these are the only findings:
- Style changes, formatting, or code aesthetic preferences
- Refactors or rewrites that improve clarity or maintainability
- Code that is already correct but written differently than you would write it
- Adding libraries, imports, or dependencies that are appropriate for the task
- Improvements to error messages, user-facing output, or logging
- Changes that are clearly intentional upgrades (e.g., switching from manual ANSI codes to chalk)
- Anything where the natural suggested fix is "no change needed" or "this is already an improvement"

Be ruthless about filtering. If you cannot articulate a concrete production failure caused by the code, do not report it.
Only comment on lines that were ADDED or MODIFIED in the diff.`,
        prompt: `Review Plan — Focus: ${scope.focus.join(', ')}\nFile: ${file.path}\n\nFull Content:\n\`\`\`\n${fileContent}\n\`\`\`\n\nGit Diff:\n\`\`\`diff\n${file.diff}\n\`\`\``
      });

      const fileComments: ReviewComment[] = response.object.comments.map((c: any) => ({
        filePath: file.path,
        line: c.line,
        severity: c.severity,
        category: c.category,
        title: c.title,
        problem: c.problem,
        whyItMatters: c.whyItMatters,
        consequences: c.consequences,
        suggestedPatch: c.suggestedPatch,
        confidence: 0.90
      }));

      newComments.push(...fileComments);
      state.callbacks?.onFileDone?.(file.path, fileComments.length);
    } catch (error: any) {
      console.error(`Failed to review ${file.path}:`, error.message);
      state.callbacks?.onFileDone?.(file.path, 0);
    }
  }

  return { comments: newComments };
}

/**
 * Node: build_ast
 * Builds local call graph and extracts caller contexts. No LLM call.
 */
async function nodeBuildAST(state: GraphStateType): Promise<Partial<GraphStateType>> {
  state.callbacks?.onASTStart?.();
  const graph = await buildCallGraph(state.repoRoot);
  state.callbacks?.onASTDone?.(Object.keys(graph).length);

  const callerContexts: CallerContext[] = [];

  for (const file of state.changedFiles) {
    const fileNode = graph[file.path];
    if (!fileNode) continue;
    const modifiedExports = getModifiedExports(file, fileNode.exports);
    for (const exp of modifiedExports) {
      for (const [importerPath, importerNode] of Object.entries(graph)) {
        if (importerPath === file.path) continue;
        const specifier = importerNode.imports[exp];
        if (specifier && matchesImport(specifier, importerPath, file.path)) {
          const contexts = await getCallerContexts(importerPath, exp, state.repoRoot);
          callerContexts.push(...contexts.map(c => ({ ...c, symbol: exp })));
        }
      }
    }
  }

  if (callerContexts.length === 0) {
    state.callbacks?.onCrossFileSkipped?.();
  }

  return { callerContexts };
}

/**
 * Node: cross_file_analyzer
 * Calls Gemini to evaluate pre-built caller contexts for integration issues.
 * Only reached if callerContexts.length > 0 (enforced by conditional edge).
 */
async function nodeCrossFileAnalyzer(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  state.callbacks?.onCrossFileStart?.(state.callerContexts.length);
  await sleep(12000);

  const formattedContexts = state.callerContexts.map(c =>
    `--- Caller: ${c.filePath} (Line ${c.line}), Symbol: ${c.symbol} ---\n${c.context}`
  ).join('\n\n');

  try {
    const response = await generateObjectWithFallback({
      maxRetries: 0,
      schema: z.object({
        findings: z.array(z.object({
          filePath: z.string(),
          line: z.number(),
          severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          category: z.enum(['Security', 'Performance', 'Logic', 'Style']),
          title: z.string(),
          problem: z.string(),
          whyItMatters: z.string(),
          consequences: z.string(),
          suggestedPatch: z.string().optional()
        }))
      }),
      system: `You are a Systems Architect reviewing downstream impact of code changes.

ONLY report issues where a change in the modified files CONCRETELY BREAKS an unmodified caller file. This means:
- A function signature changed and the caller is passing the wrong number or type of arguments
- An exported type or interface changed and the caller is now structurally incompatible
- A function was deleted or renamed and the caller still references the old name

DO NOT report:
- Style differences between the changed file and the caller
- Suggestions to improve the caller code independently of the changes
- Theoretical or speculative issues without clear evidence in the caller code
- Anything where the caller code still works correctly despite the change

Only report high-confidence, concrete integration breakages with clear evidence from the caller snippet.`,
      prompt: `Changed files:\n${state.changedFiles.map(f => `File: ${f.path}\nDiff:\n${f.diff}`).join('\n\n')}\n\nDownstream caller locations:\n${formattedContexts}`
    });

    const crossComments: ReviewComment[] = response.object.findings.map((f: any) => ({
      ...f, confidence: 0.85
    }));

    state.callbacks?.onCrossFileDone?.(crossComments.length);
    return { comments: crossComments };
  } catch (error: any) {
    console.error('Cross-file analysis failed:', error.message);
    state.callbacks?.onCrossFileDone?.(0);
    return {};
  }
}

// ─── Graph Assembly ───────────────────────────────────────────────────────────

const reviewGraph = new StateGraph(GraphState)
  .addNode('load_context',        nodeLoadContext)
  .addNode('planner',             nodePlanner)
  .addNode('file_reviewer',       nodeFileReviewer)
  .addNode('build_ast',           nodeBuildAST)
  .addNode('cross_file_analyzer', nodeCrossFileAnalyzer)
  .addEdge(START,              'load_context')
  .addConditionalEdges('load_context', (state) =>
    state.changedFiles?.length === 0 ? END : 'planner'
  )
  .addEdge('planner',          'file_reviewer')
  .addEdge('file_reviewer',    'build_ast')
  .addConditionalEdges('build_ast', (state) =>
    state.callerContexts?.length === 0 ? END : 'cross_file_analyzer'
  )
  .addEdge('cross_file_analyzer', END)
  .compile();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point. Runs the LangGraph review pipeline and returns ReviewState.
 */
export async function runReviewPipeline(
  diffMode: 'staged' | 'unstaged' | 'all' = 'all',
  cwd: string = process.cwd(),
  callbacks: PipelineCallbacks = {}
): Promise<ReviewState> {
  const result = await reviewGraph.invoke({
    diffMode,
    callbacks,
    changedFiles: [],
    comments: [],
    callerContexts: [],
    fileScopes: {},
    languages: [],
    dependencies: [],
    repoRoot: '',
    plannerGoals: '',
  });

  return {
    repoRoot:     result.repoRoot,
    languages:    result.languages,
    dependencies: result.dependencies,
    changedFiles: result.changedFiles,
    plannerGoals: result.plannerGoals,
    comments:     result.comments,
  };
}

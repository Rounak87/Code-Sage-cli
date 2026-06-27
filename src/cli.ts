#!/usr/bin/env node

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { runReviewPipeline } from './orchestrator.js';
import { reportToConsole } from './reporter.js';
import { postPullRequestReview } from './github.js';
import { hasCommits, getGitRoot } from './git.js';

const FILE_COUNT_THRESHOLD = 15;

// ─── Init Handler ────────────────────────────────────────────────────────────

function handleInit() {
  const workflowDir = path.join(process.cwd(), '.github', 'workflows');
  const workflowPath = path.join(workflowDir, 'code-review.yml');

  const workflowContent = `name: Code-Sage Reviewer

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Code-Sage
        run: npx code-sage-cli --staged
        env:
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

  try {
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(workflowPath, workflowContent, 'utf8');
    console.log('');
    console.log(chalk.green('✔') + chalk.bold(' GitHub Actions workflow created successfully'));
    console.log('  ' + chalk.dim('Saved to: ') + chalk.cyan(path.relative(process.cwd(), workflowPath)));
    console.log('');
    console.log(chalk.bold('Next steps:'));
    console.log('  1. Add ' + chalk.cyan('GEMINI_API_KEY') + ' to GitHub repository secrets');
    console.log('     ' + chalk.dim('Settings → Secrets and variables → Actions → New repository secret'));
    console.log('  2. Commit and push the workflow file');
    console.log('     ' + chalk.dim('git add .github/workflows/code-review.yml && git commit -m "ci: add code-sage reviewer"'));
    console.log('  3. Open a Pull Request — Code-Sage will post inline reviews automatically');
    console.log('');
    process.exit(0);
  } catch (error: any) {
    console.error(chalk.red('✖') + ' Failed to create workflow file: ' + error.message);
    process.exit(1);
  }
}

// ─── Guard: Initial commit / large staged set ─────────────────────────────

function getStagedFileCount(cwd: string): number {
  try {
    const output = execSync('git diff --cached --name-only', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    return output ? output.split('\n').length : 0;
  } catch {
    return 0;
  }
}

function runGuard(mode: string, force: boolean, cwd: string): void {
  const root = getGitRoot(cwd);
  const isFirstCommit = !hasCommits(root);
  const stagedCount = (mode === 'staged' || mode === 'all') ? getStagedFileCount(root) : 0;

  if (force) return;

  if (isFirstCommit) {
    console.log('');
    console.log(chalk.yellow('  Warning') + chalk.dim('  No previous commits detected in this repository.'));
    console.log(chalk.dim('           Code-Sage is designed to review incremental changes, not initial project setup.'));
    console.log('');
    console.log(chalk.dim('  To proceed anyway, run with the ') + chalk.cyan('--force') + chalk.dim(' flag.'));
    console.log('');
    process.exit(0);
  }

  if (stagedCount > FILE_COUNT_THRESHOLD) {
    console.log('');
    console.log(chalk.yellow('  Warning') + chalk.dim(`  ${stagedCount} staged files detected.`));
    console.log(chalk.dim('           This looks like a bulk staging operation rather than a feature change.'));
    console.log(chalk.dim('           Reviewing all files may exhaust your API quota and take a long time.'));
    console.log('');
    console.log(chalk.dim('  Options:'));
    console.log('    ' + chalk.cyan('--force') + chalk.dim('         Proceed with all staged files'));
    console.log('    ' + chalk.cyan('--unstaged') + chalk.dim('      Review only unstaged local changes instead'));
    console.log('');
    process.exit(0);
  }
}

// ─── Header ──────────────────────────────────────────────────────────────────

function printHeader() {
  console.log('');
  console.log(chalk.bold.white('  Code-Sage') + chalk.dim('  AI Code Reviewer'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  printHeader();

  const args = process.argv.slice(2);

  if (args.includes('--init') || args.includes('init')) {
    handleInit();
  }

  // Validate API key
  if (!process.env.GEMINI_API_KEY) {
    console.log('');
    console.log(chalk.red('  Error') + chalk.dim('  GEMINI_API_KEY is not configured.'));
    console.log(chalk.dim('         Create a .env file at the root of your project:'));
    console.log('         ' + chalk.cyan('GEMINI_API_KEY=your_key_here'));
    console.log(chalk.dim('         Get a free key at: ') + chalk.underline('https://aistudio.google.com/'));
    console.log('');
    process.exit(1);
  }

  // Parse flags
  let mode: 'staged' | 'unstaged' | 'all' = 'all';
  if (args.includes('--staged')) mode = 'staged';
  else if (args.includes('--unstaged')) mode = 'unstaged';
  const force = args.includes('--force');

  // Run guard checks
  runGuard(mode, force, process.cwd());

  const primaryModel = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  console.log('');
  console.log(chalk.dim(`  Mode   `) + chalk.white(mode.toUpperCase()));
  console.log(chalk.dim(`  Model  `) + chalk.white(primaryModel));
  console.log('');

  const startTime = Date.now();

  // ── Stage 1: Planner ────────────────────────────────────────────────────
  const plannerSpinner = ora({ text: 'Analyzing diff and building review plan...', indent: 2 }).start();

  let state: any;
  try {
    state = await runReviewPipeline(mode, process.cwd(), {
      onPlannerDone: (goals: string) => {
        plannerSpinner.succeed(chalk.dim('Review plan ready'));
      },
      onFileStart: (filePath: string, index: number, total: number) => {
        plannerSpinner.text = `Reviewing ${chalk.cyan(filePath)} ${chalk.dim(`(${index}/${total})`)}`;
        plannerSpinner.start();
      },
      onFileDone: (filePath: string, count: number) => {
        plannerSpinner.succeed(chalk.dim(`${filePath}`) + chalk.dim(` — ${count} issue${count !== 1 ? 's' : ''} found`));
      },
      onFileSkipped: (filePath: string) => {
        plannerSpinner.info(chalk.dim(`${filePath} — skipped by planner`));
      },
      onASTStart: () => {
        plannerSpinner.text = 'Building AST call graph...';
        plannerSpinner.start();
      },
      onASTDone: (nodeCount: number) => {
        plannerSpinner.succeed(chalk.dim(`Call graph built — ${nodeCount} module nodes mapped`));
      },
      onCrossFileStart: (callerCount: number) => {
        plannerSpinner.text = `Analyzing ${callerCount} caller location${callerCount !== 1 ? 's' : ''} across unmodified files...`;
        plannerSpinner.start();
      },
      onCrossFileDone: (count: number) => {
        if (count > 0) {
          plannerSpinner.succeed(chalk.dim(`Cross-file analysis complete — ${count} integration issue${count !== 1 ? 's' : ''} found`));
        } else {
          plannerSpinner.succeed(chalk.dim('Cross-file analysis complete — no integration issues found'));
        }
      },
      onCrossFileSkipped: () => {
        plannerSpinner.info(chalk.dim('No cross-file callers affected — skipping impact analysis'));
      },
    });
  } catch (error: any) {
    plannerSpinner.fail(chalk.red('Review pipeline failed: ') + error.message);
    process.exit(1);
  }

  if (state.changedFiles.length === 0) {
    console.log('');
    console.log(chalk.dim('  No changed files detected. Nothing to review.'));
    console.log('');
    process.exit(0);
  }

  // ── Post / Report ───────────────────────────────────────────────────────
  const postSpinner = ora({ text: 'Posting review...', indent: 2 }).start();
  try {
    await postPullRequestReview(state.comments);
    postSpinner.stop();
  } catch (error: any) {
    postSpinner.fail('Failed to post GitHub review: ' + error.message);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(chalk.dim(`  ─────────────────────────────────────`));
  console.log(chalk.dim(`  Completed in ${duration}s`));
  console.log('');

  reportToConsole(state);
}

main();

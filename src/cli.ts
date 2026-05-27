#!/usr/bin/env node

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runReviewPipeline } from './orchestrator.js';
import { reportToConsole } from './reporter.js';
import { postPullRequestReview } from './github.js';

// Console coloring codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

function printHeader() {
  console.log(`
┌──────────────────────────────────────────────┐
│        🤖 GEMINI AI CODE REVIEWER 🤖         │
└──────────────────────────────────────────────┘
  `);
}

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
    console.log(`\n🎉 ${CYAN}${BOLD}Successfully created GitHub Actions workflow file!${RESET}`);
    console.log(`Saved to: ${BOLD}${path.relative(process.cwd(), workflowPath)}${RESET}`);
    console.log(`\nNext steps:`);
    console.log(`1. Add your ${BOLD}GEMINI_API_KEY${RESET} to GitHub Secrets:`);
    console.log(`   Go to: ${CYAN}Repository Settings ➔ Secrets and variables ➔ Actions${RESET}`);
    console.log(`2. Commit and push the generated file to your repository.`);
    console.log(`3. Open a Pull Request to see Code-Sage post inline reviews!\n`);
    process.exit(0);
  } catch (error: any) {
    console.error(`\n${RED}${BOLD}Failed to create workflow file:${RESET}`);
    console.error(error.message);
    process.exit(1);
  }
}

async function main() {
  printHeader();

  // Parse command arguments
  const args = process.argv.slice(2);

  if (args.includes('--init') || args.includes('init')) {
    handleInit();
  }

  // Validate API key
  if (!process.env.GEMINI_API_KEY) {
    console.error(`\n${RED}${BOLD}Error: GEMINI_API_KEY is not configured.${RESET}`);
    console.error(`Please create a ${BOLD}.env${RESET} file in the root of your project and set it:`);
    console.error(`${CYAN}GEMINI_API_KEY=your_actual_key_here${RESET}`);
    console.error(`\nYou can generate a free API key at: ${BOLD}https://aistudio.google.com/${RESET}\n`);
    process.exit(1);
  }

  let mode: 'staged' | 'unstaged' | 'all' = 'all';

  if (args.includes('--staged')) {
    mode = 'staged';
  } else if (args.includes('--unstaged')) {
    mode = 'unstaged';
  }

  console.log(`🔍 Review mode: ${BOLD}${mode.toUpperCase()}${RESET} changes`);
  const primaryModel = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const backupModel = process.env.GEMINI_BACKUP_MODEL || 'gemini-2.5-flash-lite';
  console.log(`📡 Connected model: ${BOLD}${primaryModel}${RESET} (Backup: ${backupModel})`);
  console.log(`⏳ Initializing pipeline, parsing git diff...`);

  try {
    const startTime = Date.now();
    
    // Run the pipeline
    console.log(`📋 Running context builder & generating plan...`);
    const state = await runReviewPipeline(mode);

    if (state.changedFiles.length === 0) {
      console.log(`\n✨ No changed files detected in this git state. Nothing to review!`);
      process.exit(0);
    }

    console.log(`🧠 Analyzing individual files in parallel...`);
    console.log(`🕵️ Investigating cross-file impacts (agent loop)...`);
    
    // Write reports / post review
    await postPullRequestReview(state.comments);
    reportToConsole(state);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ Review completed in ${duration}s.\n`);

  } catch (error: any) {
    console.error(`\n${RED}${BOLD}Error executing review pipeline:${RESET}`);
    console.error(error.message);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runReviewPipeline } from './orchestrator.js';
import { reportToConsole, writeMarkdownReport, writeHtmlReport } from './reporter.js';

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

async function main() {
  printHeader();

  // Validate API key
  if (!process.env.GEMINI_API_KEY) {
    console.error(`\n${RED}${BOLD}Error: GEMINI_API_KEY is not configured.${RESET}`);
    console.error(`Please create a ${BOLD}.env${RESET} file in the root of your project and set it:`);
    console.error(`${CYAN}GEMINI_API_KEY=your_actual_key_here${RESET}`);
    console.error(`\nYou can generate a free API key at: ${BOLD}https://aistudio.google.com/${RESET}\n`);
    process.exit(1);
  }

  // Parse command arguments
  const args = process.argv.slice(2);
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
    
    // Write reports
    writeMarkdownReport(state);
    writeHtmlReport(state);
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

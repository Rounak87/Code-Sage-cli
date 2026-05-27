import * as fs from 'fs';
import * as path from 'path';
import { ReviewState, ReviewComment } from './orchestrator.js';

// Color logging helpers for terminal
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';

/**
 * Outputs the review findings to the console with beautiful coloring.
 */
export function reportToConsole(state: ReviewState): void {
  const { comments } = state;
  console.log(`\n${BOLD}==================================================`);
  console.log(`🚀 ${GREEN}GEMINI CODE REVIEW COMPLETE${RESET}`);
  console.log(`${BOLD}==================================================${RESET}`);

  if (comments.length === 0) {
    console.log(`\n✨ ${GREEN}No issues found! Your code looks clean and solid.${RESET}\n`);
    return;
  }

  const highCount = comments.filter(c => c.severity === 'HIGH').length;
  const medCount = comments.filter(c => c.severity === 'MEDIUM').length;
  const lowCount = comments.filter(c => c.severity === 'LOW').length;

  console.log(`\nFound ${BOLD}${comments.length} issues${RESET}:`);
  console.log(`- 🔴 ${RED}${highCount} High severity${RESET}`);
  console.log(`- 🟡 ${YELLOW}${medCount} Medium severity${RESET}`);
  console.log(`- 🔵 ${CYAN}${lowCount} Low severity${RESET}\n`);

  comments.forEach((c, index) => {
    let severityColor = CYAN;
    let severityIcon = '🔵';
    if (c.severity === 'HIGH') {
      severityColor = RED;
      severityIcon = '🔴';
    } else if (c.severity === 'MEDIUM') {
      severityColor = YELLOW;
      severityIcon = '🟡';
    }

    console.log(`${BOLD}${index + 1}. ${severityIcon} ${severityColor}[${c.severity}]${RESET} ${BOLD}${c.category}:${RESET} ${c.title}`);
    console.log(`   ${BOLD}File:${RESET} ${c.filePath}:${c.line}`);
    console.log(`   ${BOLD}Problem:${RESET} ${c.problem}`);
    console.log(`   ${BOLD}Consequences:${RESET} ${c.consequences}`);
    if (c.suggestedPatch) {
      console.log(`   ${BOLD}Suggested Patch:${RESET}\n${c.suggestedPatch}`);
    }
    console.log('-'.repeat(50));
  });
}




import chalk from 'chalk';
import { ReviewState, ReviewComment } from './orchestrator.js';

const SEVERITY_COLOR: Record<string, (s: string) => string> = {
  HIGH:   (s) => chalk.red(s),
  MEDIUM: (s) => chalk.yellow(s),
  LOW:    (s) => chalk.cyan(s),
};

const CATEGORY_COLOR: Record<string, (s: string) => string> = {
  Security:    (s) => chalk.red(s),
  Performance: (s) => chalk.yellow(s),
  Logic:       (s) => chalk.magenta(s),
  Style:       (s) => chalk.cyan(s),
};

/**
 * Outputs the review findings to the console in a clean, structured format.
 */
export function reportToConsole(state: ReviewState): void {
  const { comments } = state;

  if (comments.length === 0) {
    console.log(chalk.green('  No issues found.') + chalk.dim(' Your changes look clean.'));
    console.log('');
    return;
  }

  const highCount   = comments.filter(c => c.severity === 'HIGH').length;
  const medCount    = comments.filter(c => c.severity === 'MEDIUM').length;
  const lowCount    = comments.filter(c => c.severity === 'LOW').length;

  // Summary line
  console.log(
    chalk.bold(`  ${comments.length} issue${comments.length !== 1 ? 's' : ''} found`) +
    chalk.dim('  ·  ') +
    chalk.red(`${highCount} high`) +
    chalk.dim('  ·  ') +
    chalk.yellow(`${medCount} medium`) +
    chalk.dim('  ·  ') +
    chalk.cyan(`${lowCount} low`)
  );
  console.log('');

  comments.forEach((c, index) => {
    const severityTag = SEVERITY_COLOR[c.severity]?.(c.severity) ?? c.severity;
    const categoryTag = CATEGORY_COLOR[c.category]?.(c.category) ?? c.category;

    console.log(
      chalk.bold(`  ${index + 1}.`) +
      `  [${severityTag}]  ` +
      chalk.dim(`[${categoryTag}]  `) +
      chalk.bold(c.title)
    );
    console.log(chalk.dim(`      ${c.filePath}`) + chalk.dim(`:${c.line}`));
    console.log('');
    console.log(`      ${chalk.bold('Problem')}      ${c.problem}`);
    console.log(`      ${chalk.bold('Consequences')} ${c.consequences}`);

    if (c.suggestedPatch) {
      console.log('');
      console.log(`      ${chalk.bold('Suggested Patch')}`);
      const patchLines = c.suggestedPatch.split('\n');
      patchLines.forEach(line => {
        if (line.startsWith('+')) {
          process.stdout.write(chalk.green(`        ${line}\n`));
        } else if (line.startsWith('-')) {
          process.stdout.write(chalk.red(`        ${line}\n`));
        } else {
          process.stdout.write(chalk.dim(`        ${line}\n`));
        }
      });
    }

    console.log('');
    console.log(chalk.dim('  ' + '─'.repeat(60)));
    console.log('');
  });
}

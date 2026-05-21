import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface ChangedFile {
  path: string; // File path relative to repo root
  diff: string; // Raw diff for this file
  chunks: DiffChunk[];
  isNew: boolean;
  isDeleted: boolean;
}

export interface DiffChunk {
  header: string;
  newStart: number;
  newLinesCount: number;
  addedLines: { lineNumber: number; content: string }[];
  content: string; // Diff content of this chunk
}

/**
 * Executes a shell command and returns the trimmed output.
 */
function runGitCommand(cmd: string, cwd: string = process.cwd()): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (error: any) {
    // If command fails because we are not in a git repo, or another reason, throw clean error
    throw new Error(`Git command failed: "${cmd}". Details: ${error.message}`);
  }
}

/**
 * Gets the root directory of the current Git repository.
 */
export function getGitRoot(cwd: string = process.cwd()): string {
  return runGitCommand('git rev-parse --show-toplevel', cwd);
}

/**
 * Check if the repository has any commits yet.
 */
export function hasCommits(cwd: string = process.cwd()): boolean {
  try {
    runGitCommand('git rev-parse --verify HEAD', cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches the changed files and parses the diff.
 * supports staging only, unstaged only, or both.
 */
export function getGitDiff(
  mode: 'staged' | 'unstaged' | 'all' = 'all',
  cwd: string = process.cwd()
): ChangedFile[] {
  const root = getGitRoot(cwd);
  
  if (!hasCommits(root)) {
    throw new Error('This repository has no commits yet. Please make an initial commit first.');
  }

  let diffCommand = 'git diff';
  if (mode === 'staged') {
    diffCommand = 'git diff --cached';
  } else if (mode === 'all') {
    diffCommand = 'git diff HEAD'; // Both staged and unstaged
  }

  const rawDiff = runGitCommand(diffCommand, root);
  if (!rawDiff) {
    return [];
  }

  return parseDiff(rawDiff);
}

/**
 * Parses a unified git diff output into structured objects.
 */
export function parseDiff(rawDiff: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const fileDiffs = rawDiff.split(/^diff --git /m);

  for (const fileDiff of fileDiffs) {
    if (!fileDiff.trim()) continue;

    const lines = fileDiff.split('\n');
    const headerLine = lines[0]; // e.g. "a/src/index.ts b/src/index.ts"
    
    // Parse paths from: a/path b/path (handling potential quotes for spaces)
    const match = headerLine.match(/(?:a\/|["']?a\/)(.+?)(?:\s+b\/|["']?\s+b\/)(.+?)(?:["']?)$/);
    if (!match) continue;

    const filePath = match[2].replace(/^b\//, ''); // Clean up any lingering prefix
    
    let isNew = false;
    let isDeleted = false;
    const headerLines: string[] = [];
    const chunkLines: string[] = [];

    // Separate headers from chunk content
    let readingChunks = false;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('new file mode')) {
        isNew = true;
      }
      if (line.startsWith('deleted file mode')) {
        isDeleted = true;
      }

      if (line.startsWith('@@')) {
        readingChunks = true;
      }

      if (readingChunks) {
        chunkLines.push(line);
      } else {
        headerLines.push(line);
      }
    }

    // Skip deleted files as there's no code to review
    if (isDeleted) continue;

    const chunks = parseChunks(chunkLines.join('\n'));

    files.push({
      path: filePath,
      diff: fileDiff,
      chunks,
      isNew,
      isDeleted
    });
  }

  return files;
}

/**
 * Parses individual hunks/chunks inside a file diff.
 */
function parseChunks(rawChunks: string): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  const lines = rawChunks.split('\n');
  
  let currentChunk: DiffChunk | null = null;
  let currentNewLineNumber = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // If we finished a chunk, save it
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      // Parse chunk header: @@ -oldStart,oldLength +newStart,newLength @@ [context]
      const match = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/);
      if (match) {
        const newStart = parseInt(match[1], 10);
        const newLinesCount = parseInt(match[2] || '1', 10);

        currentChunk = {
          header: line,
          newStart,
          newLinesCount,
          addedLines: [],
          content: line + '\n'
        };
        currentNewLineNumber = newStart;
      }
      continue;
    }

    if (!currentChunk) continue;

    currentChunk.content += line + '\n';

    if (line.startsWith('+')) {
      // Added line
      currentChunk.addedLines.push({
        lineNumber: currentNewLineNumber,
        content: line.slice(1) // Remove leading '+'
      });
      currentNewLineNumber++;
    } else if (line.startsWith('-')) {
      // Deleted line - does not increment currentNewLineNumber in new file
      // Do nothing
    } else {
      // Context line
      currentNewLineNumber++;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Fetches the full contents of a file relative to git root.
 * Returns null if file does not exist (e.g. deleted).
 */
export function getFileContent(filePath: string, root: string): string | null {
  const fullPath = path.resolve(root, filePath);
  try {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

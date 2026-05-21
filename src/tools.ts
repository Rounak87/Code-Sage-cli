import * as fs from 'fs';
import * as path from 'path';

// Directories to ignore during recursive search
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.reviewer-cache',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml'
]);

// File extensions to search
const SEARCHABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.go', '.rs', '.java', '.cpp', '.c', '.h', '.cs', '.php', '.rb', '.yml', '.yaml', '.toml', '.prisma'
]);

/**
 * Checks if a path is ignored.
 */
function isIgnored(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  return parts.some(part => IGNORED_DIRS.has(part));
}

/**
 * Lists the contents of a directory relative to the git root.
 */
export function listDirectory(dirPath: string, root: string): string {
  const fullPath = path.resolve(root, dirPath);
  try {
    if (!fs.existsSync(fullPath)) {
      return `Error: Directory does not exist at "${dirPath}"`;
    }
    if (!fs.statSync(fullPath).isDirectory()) {
      return `Error: "${dirPath}" is a file, not a directory.`;
    }

    const items = fs.readdirSync(fullPath);
    const result: string[] = [];

    for (const item of items) {
      const relItemPath = path.join(dirPath, item);
      if (isIgnored(relItemPath)) continue;

      const itemFullPath = path.join(fullPath, item);
      const isDir = fs.statSync(itemFullPath).isDirectory();
      result.push(`${isDir ? '[DIR]' : '[FILE]'} ${item}`);
    }

    return result.length > 0 ? result.join('\n') : 'Empty directory.';
  } catch (error: any) {
    return `Error reading directory: ${error.message}`;
  }
}

/**
 * Reads a file relative to git root.
 */
export function fetchFileContent(filePath: string, root: string): string {
  const fullPath = path.resolve(root, filePath);
  try {
    if (!fs.existsSync(fullPath)) {
      return `Error: File does not exist at "${filePath}"`;
    }
    if (!fs.statSync(fullPath).isFile()) {
      return `Error: "${filePath}" is not a file.`;
    }

    // Read file, limit size to 100KB to prevent context bloat
    const stats = fs.statSync(fullPath);
    if (stats.size > 100 * 1024) {
      return `Warning: File "${filePath}" is too large (${Math.round(stats.size / 1024)}KB). Fetching only the first 1000 lines.\n\n` +
             readFirstNLines(fullPath, 1000);
    }

    return fs.readFileSync(fullPath, 'utf-8');
  } catch (error: any) {
    return `Error reading file: ${error.message}`;
  }
}

function readFirstNLines(filePath: string, n: number): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  return lines.slice(0, n).join('\n');
}

/**
 * Searches the codebase for a query string.
 */
export function searchCodebase(query: string, root: string): string {
  if (!query || query.trim().length < 2) {
    return 'Error: Search query must be at least 2 characters long.';
  }

  const results: { file: string; line: number; text: string }[] = [];
  const lowercaseQuery = query.toLowerCase();

  function searchDir(dir: string) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relPath = path.relative(root, fullPath);

      if (isIgnored(relPath)) continue;

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        searchDir(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (!SEARCHABLE_EXTENSIONS.has(ext)) continue;

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.toLowerCase().includes(lowercaseQuery)) {
            const lines = content.split('\n');
            lines.forEach((lineText, idx) => {
              if (lineText.toLowerCase().includes(lowercaseQuery)) {
                results.push({
                  file: relPath.replace(/\\/g, '/'),
                  line: idx + 1,
                  text: lineText.trim()
                });
              }
            });
          }
        } catch {
          // Ignore files that fail to read (e.g. binaries mistakenly classified)
        }
      }

      // Cap results to 50 matches to prevent context window explosion
      if (results.length >= 50) return;
    }
  }

  try {
    searchDir(root);
    if (results.length === 0) {
      return `No matches found for query: "${query}"`;
    }

    const output = results.map(r => `${r.file}:${r.line}: ${r.text}`).join('\n');
    return results.length >= 50 ? `${output}\n\n[Truncated: showing first 50 results]` : output;
  } catch (error: any) {
    return `Error scanning codebase: ${error.message}`;
  }
}

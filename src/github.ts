import * as fs from 'fs';
import { Octokit } from '@octokit/rest';
import { ReviewComment } from './orchestrator.js';

/**
 * Posts AI review comments directly to the active GitHub Pull Request if running in CI.
 */
export async function postPullRequestReview(
  comments: ReviewComment[]
): Promise<void> {
  // Check if running inside GitHub Actions
  if (process.env.GITHUB_ACTIONS !== 'true') {
    console.log('ℹ️ Skipping GitHub PR posting: Not running in GitHub Actions environment.');
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('❌ Error: GITHUB_TOKEN is not defined in environment. Cannot post PR review.');
    return;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    console.error('❌ Error: GITHUB_EVENT_PATH is missing or invalid.');
    return;
  }

  let event: any;
  try {
    event = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
  } catch (error: any) {
    console.error(`❌ Error: Failed to parse GitHub event JSON: ${error.message}`);
    return;
  }

  const prNumber = event.pull_request?.number;
  const commitSha = event.pull_request?.head?.sha;
  if (!prNumber || !commitSha) {
    console.log('ℹ️ Event is not a pull request. Skipping GitHub PR posting.');
    return;
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !repository.includes('/')) {
    console.error('❌ Error: GITHUB_REPOSITORY is invalid or missing.');
    return;
  }

  const [owner, repo] = repository.split('/');
  const octokit = new Octokit({ auth: token });

  if (comments.length === 0) {
    try {
      console.log('📡 Submitting clean review to PR...');
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitSha,
        event: 'APPROVE',
        body: '🤖 **Code-Sage**: All checks passed! Your code looks clean, solid, and structurally sound.'
      });
      console.log('✅ Approved review posted.');
    } catch (error: any) {
      console.error(`❌ Failed to post approval review: ${error.message}`);
    }
    return;
  }

  // Format comments for GitHub pulls API
  const octokitComments = comments.map(c => ({
    path: c.filePath,
    line: c.line,
    body: `### 🤖 Code-Sage: ${c.title} [${c.severity}]\n\n**Problem:** ${c.problem}\n\n**Why It Matters:** ${c.whyItMatters}\n\n**Suggested Fix:**\n\`\`\`diff\n${c.suggestedPatch || 'No patch suggested'}\n\`\`\``
  }));

  try {
    console.log(`📡 Submitting PR review with ${comments.length} inline comments...`);
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      event: 'COMMENT',
      comments: octokitComments
    });
    console.log('✅ GitHub PR review posted successfully.');
  } catch (error: any) {
    console.warn(`⚠️ Failed to post inline review comments (likely due to line-matching mismatches): ${error.message}`);
    console.log('🔄 Falling back to posting a unified summary review...');

    // Fallback: Post a single review containing a summary markdown list of all issues
    let summaryBody = `## 🤖 Code-Sage Review Findings\n\n`;
    summaryBody += `I found **${comments.length}** issue(s) that might need attention:\n\n`;

    comments.forEach((c, idx) => {
      summaryBody += `### ${idx + 1}. [${c.severity}] ${c.category}: ${c.title}\n`;
      summaryBody += `* **File**: \`${c.filePath}:${c.line}\`\n`;
      summaryBody += `* **Problem**: ${c.problem}\n`;
      summaryBody += `* **Why It Matters**: ${c.whyItMatters}\n`;
      if (c.suggestedPatch) {
        summaryBody += `* **Suggested Fix**:\n\`\`\`diff\n${c.suggestedPatch}\n\`\`\`\n`;
      }
      summaryBody += `\n---\n`;
    });

    try {
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitSha,
        event: 'COMMENT',
        body: summaryBody
      });
      console.log('✅ Unified summary review posted successfully on the PR.');
    } catch (fallbackError: any) {
      console.error(`❌ Failed to post fallback PR review: ${fallbackError.message}`);
    }
  }
}

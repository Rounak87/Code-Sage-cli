# Code-Sage CLI
An automated GitHub Pull Request code reviewer powered by Gemini and local AST dependency analysis.

Code-Sage is designed to run natively in your CI/CD pipeline, automatically posting precise, inline code reviews and engineering suggestions directly onto your Pull Request diffs. 

Unlike conventional AI code reviewers that analyze files in isolation, Code-Sage builds an Abstract Syntax Tree (AST) call-graph of your project to trace the downstream "blast radius" of signature changes. This ensures that if you change an export signature, Code-Sage locates and reviews unmodified files that call it—catching integration bugs before they merge.

---

## Architecture & Core Features

### 🚀 Automated GitHub PR Reviews (Primary Focus)
* **Inline Line-Level Reviews**: Publishes reviews directly onto the specific files and lines modified or affected.
* **Intelligent Diff Matching**: Leverages `@octokit/rest` to map comments directly to PR diff coordinate regions.
* **Unified Review Fallbacks**: Automatically falls back to posting a structured, high-level summary review if coordinate drifts occur.

### 🧠 AST Call-Graph Blast Radius Analysis
* **Module Dependency Mapping**: Extracts function declarations, class structures, imports, and caller-site nodes locally.
* **Contextual Prompting**: Feeds Gemini only the changed diff and the 10-line context surrounding unmodified calling locations.
* **Token Efficiency**: Prevents context window overload by bypassing bloated, repository-wide file loading.

---

## ⚡ Quick Start: 3-Minute GitHub Actions Setup

To enable automated reviews on every Pull Request:

### Step 1: Add your Gemini API Key to GitHub Secrets
1. Navigate to your GitHub repository **Settings** ➔ **Secrets and variables** ➔ **Actions**.
2. Click **New repository secret**.
3. Create a secret named `GEMINI_API_KEY` and paste your API key (get one from [Google AI Studio](https://aistudio.google.com/)).

### Step 2: Auto-Generate the Workflow File
In the root directory of your project, run:

```bash
npx code-sage-cli --init
```

This automatically creates `.github/workflows/code-review.yml` with the correct permissions and runner commands:

```yaml
name: Code-Sage Reviewer

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write # Required to post inline reviews
      contents: read       # Required to checkout code
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Required to calculate git diffs between commits

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Code-Sage
        run: npx code-sage-cli --staged
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # Provided automatically by GitHub Actions
```

### Step 3: Commit and Push
Commit and push the generated workflow file:
```bash
git add .github/workflows/code-review.yml
git commit -m "ci: integrate code-sage-cli PR review workflow"
git push origin main
```

---

## Local Usage

You can also run Code-Sage locally to review uncommitted code changes before staging or committing:

### 1. Set environment variable
* **macOS/Linux**: `export GEMINI_API_KEY="your_api_key_here"`
* **Windows (PowerShell)**: `$env:GEMINI_API_KEY="your_api_key_here"`

### 2. Execute
```bash
# Review all local modifications (staged + unstaged)
npx code-sage-cli

# Review staged changes only
npx code-sage-cli --staged

# Review unstaged changes only
npx code-sage-cli --unstaged
```

---

## Contributing & Local Development

If you want to customize the review prompts, heuristics, or extend AST parsing support:

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Compile the TypeScript compiler output:
   ```bash
   npm run build
   ```
3. Link the package locally:
   ```bash
   npm link
   ```
4. Run locally from source:
   ```bash
   code-sage-cli
   ```

---

## License
MIT License.

# Code-Sage CLI

An intelligent, AST call-graph based AI code reviewer powered by Gemini. 

Unlike traditional LLM code reviewers that analyze files in isolation, Code-Sage performs semantic impact analysis. It parses the Abstract Syntax Tree (AST) of your local workspace, maps code dependencies, and traces the "blast radius" of signature changes to catch downstream integration bugs before they reach production.

---

## Key Features

* **AST Call-Graph Dependency Analysis**: Maps function/class definitions, exports, imports, and calls to track inter-module dependencies dynamically.
* **Semantic Impact Tracing**: When an export signature changes, Code-Sage automatically extracts caller-site code contexts from unmodified files to review them for compatibility.
* **Token-Efficient Evaluation**: Minimizes LLM token consumption by sending only the git diff and relevant caller context blocks.
* **Closed-Loop CI Integration**: Plugs into GitHub Actions to automatically write precise, line-specific suggestions directly onto Pull Request diffs.
* **Developer-First CLI Output**: Runs locally without posting to GitHub, providing color-coded warnings and ready-to-apply patches in the terminal.

---

## Local Usage

Run Code-Sage on any local JavaScript or TypeScript project without installing it globally.

### 1. Set the API Key
Get a free Gemini API Key from [Google AI Studio](https://aistudio.google.com/).

Set the environment variable in your terminal:
* **macOS/Linux**:
  ```bash
  export GEMINI_API_KEY="your_api_key_here"
  ```
* **Windows (PowerShell)**:
  ```powershell
  $env:GEMINI_API_KEY="your_api_key_here"
  ```

*(Alternatively, you can place `GEMINI_API_KEY=your_api_key_here` in a `.env` file at the root of your project).*

### 2. Execute Code-Sage
Navigate to your repository and run:

```bash
# Review all uncommitted changes
npx code-sage-cli

# Review staged changes only
npx code-sage-cli --staged

# Review unstaged changes only
npx code-sage-cli --unstaged
```

---

## CI/CD Pipeline Setup (GitHub Actions)

Configure Code-Sage to automatically review Pull Requests and comment inline with code feedback.

### Step 1: Save Gemini Secret on GitHub
1. Go to your GitHub repository **Settings** ➔ **Secrets and variables** ➔ **Actions**.
2. Click **New repository secret**.
3. Set the name to `GEMINI_API_KEY` and paste your Gemini API Key.

### Step 2: Auto-Generate the Workflow File
In the root directory of your repository, execute:

```bash
npx code-sage-cli --init
```

This generates `.github/workflows/code-review.yml` with the following configuration:

```yaml
name: Code-Sage Reviewer

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
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Local Development

If you wish to clone, extend, or run Code-Sage from source:

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Build the project compiler:
   ```bash
   npm run build
   ```
3. Link the package locally:
   ```bash
   npm link
   ```
4. Execute your local build globally:
   ```bash
   code-sage
   ```

---

## License

 configureMIT License.

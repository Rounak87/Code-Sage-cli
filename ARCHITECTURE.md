# Architecture Blueprint: Gemini Code Reviewer System

This document outlines the detailed system architecture, database design, queue management, and agent orchestration for both the **Local CLI Tool** (Phase 1) and the **Cloud Webhook App** (Phase 2).

---

## 1. System Topology

The system can operate in two topologies: **Local CLI Mode** (runs locally on the developer's computer) and **Cloud Webhook Mode** (runs as a hosted service integrated with GitHub).

```mermaid
flowchart TB
    subgraph Local Mode (Developer Machine)
        A[Git Repository] -->|Staged Diff| B[CLI Controller]
        B -->|Local AST / Search Tools| C[Agent Orchestrator]
        C -->|Gemini API| D[Google Gen AI]
        C -->|Write Report| E[REVIEW_REPORT.md]
    end

    subgraph Cloud Mode (Railway / Hosted)
        GH[GitHub Webhooks] -->|PR Open/Sync| WebhookReceiver[Express Server]
        WebhookReceiver -->|Enqueue Job| BullMQ[BullMQ / Redis Queue]
        BullMQ -->|Process Asynchronously| Worker[Worker Daemon]
        Worker -->|DB Transactions| DB[(PostgreSQL Database)]
        Worker -->|Fetch Diff / Files| GithubAPI[GitHub REST API]
        Worker -->|Orchestrated Prompts| AgentEngine[Agent Engine]
        AgentEngine -->|Gemini API| D
        Worker -->|Post PR Review Comments| GithubAPI
    end
```

---

## 2. Database Schema Design (Prisma ORM)

For Phase 2 (and optionally Phase 1 if using a local SQLite database to cache reviews and track stats), the database structure is critical. We use PostgreSQL with Prisma ORM.

This schema tracks **Repositories**, **Pull Requests**, **Review Runs**, **Review Comments**, and **Agent Steps** (crucial for debugging why an agent made a certain decision).

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-id"
}

// Tracks Git Repositories registered in the system
model Repository {
  id            String         @id @default(uuid())
  owner         String         // e.g. "google-deepmind"
  name          String         // e.g. "antigravity"
  githubId      Int            @unique // GitHub's internal repository ID
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  pullRequests  PullRequest[]
  settings      RepoSettings?
}

// Custom settings per repository (e.g. custom system prompts, focus areas)
model RepoSettings {
  id              String     @id @default(uuid())
  repositoryId    String     @unique
  repository      Repository @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  confidenceLimit Float      @default(0.70) // Don't post comments below this confidence
  customPrompt    String?    @db.Text
  excludedPaths   String[]   // List of glob patterns to ignore (e.g. "dist/**", "*.md")
}

// Tracks Pull Requests (GitHub App only)
model PullRequest {
  id           String      @id @default(uuid())
  repositoryId String
  repository   Repository  @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  number       Int         // PR Number (e.g. 142)
  title        String
  branch       String      // e.g. "feature/auth-refresh"
  creator      String      // GitHub username
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  runs         ReviewRun[]

  @@unique([repositoryId, number])
}

// A single execution of the review pipeline on a specific commit SHA
model ReviewRun {
  id            String          @id @default(uuid())
  pullRequestId String?
  pullRequest   PullRequest?    @relation(fields: [pullRequestId], references: [id], onDelete: Cascade)
  commitSha     String          // Git commit SHA reviewed
  status        RunStatus       @default(PENDING)
  totalCost     Float           @default(0.00) // Sum of LLM tokens cost
  startedAt     DateTime        @default(now())
  completedAt   DateTime?
  comments      ReviewComment[]
  agentSteps    AgentStepLog[]  // Tracing step execution for the Cross-File agent
}

enum RunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

// A single review finding posted to code
model ReviewComment {
  id          String    @id @default(uuid())
  runId       String
  run         ReviewRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  filePath    String    // File path relative to repo root
  line        Int       // Target line number
  severity    Severity
  category    String    // e.g. "Security", "Performance"
  problem     String    @db.Text
  rationale   String    @db.Text // Why it matters
  patch       String?   @db.Text // Suggested diff block
  confidence  Float
  posted      Boolean   @default(false) // Whether it was successfully written to git/GitHub
  createdAt   DateTime  @default(now())
}

enum Severity {
  LOW
  MEDIUM
  HIGH
}

// Audit logs for Agent's thoughts and actions (tool calls)
model AgentStepLog {
  id          String    @id @default(uuid())
  runId       String
  run         ReviewRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  stepNumber  Int
  thought     String    @db.Text // LLM reasoning before calling a tool
  toolName    String?   // Name of the tool called
  toolInput   String?   @db.Text // Tool inputs in JSON format
  toolOutput  String?   @db.Text // Result of tool execution
  timestamp   DateTime  @default(now())
}
```

---

## 3. Queue & Background Job Architecture (BullMQ)

In a web/cloud deployment, GitHub gives Webhook receivers exactly **10 seconds** to respond with an HTTP `200 OK`. However, a comprehensive code review pipeline (with multiple LLM stages and agent loops) takes **30 to 90 seconds**.

To prevent timeouts and handle spikes in developer commits, we introduce a **Job Queue** architecture powered by **BullMQ** and **Redis**.

```
    GitHub App Webhook
            │
            ▼ (HTTP POST /webhook)
┌──────────────────────┐
│ Express API Server   │ 
│                      │
│ 1. Validate Secret   │
│ 2. Parse Event Payload
│ 3. Add Job to Redis  │
│ 4. Return HTTP 200   │
└──────────┬───────────┘
           │
           ▼ (Job: { prNumber, commitSha, repoUrl })
┌──────────────────────┐
│   Redis Memory Store │
└──────────┬───────────┘
           │
           ▼ (Pulls Job asynchronously)
┌──────────────────────┐
│ BullMQ Worker        │ 
│                      │
│ 1. Context Builder   │
│ 2. Run Agent Pipeline│
│ 3. Post PR Comments  │
└──────────────────────┘
```

### BullMQ Worker Orchestration Details:
1. **Concurrency Control**: Concurrency can be set to limit how many reviews are processed at once, protecting the database and avoiding rate limits on the Gemini API.
2. **Deduplication (Job Key)**: If a developer commits 3 times in rapid succession, we can deduplicate jobs in Redis by setting the BullMQ jobId to `repoId-prNumber-commitSha`. If a review is already queued for that exact commit, we don't start a second one.
3. **Failed Job Retries**: If the Gemini API returns a rate limit error (HTTP 429), BullMQ automatically retries the review with exponential backoff (e.g. wait 5s, then 10s, then 20s).

---

## 4. Agent Orchestration Engine (Deep Dive)

The core logic of the reviewer resides in the **Agent Orchestrator**. This class runs the stages sequentially and passes state between them.

### State Object Schema (TypeScript)
```typescript
interface ReviewState {
  repoPath: string;
  commitSha: string;
  languages: string[];
  dependencies: string[];
  changedFiles: ChangedFile[];
  plannerDirectives?: ReviewPlan;
  rawComments: DraftComment[];
  crossFileComments: DraftComment[];
  finalComments: ApprovedComment[];
}

interface ChangedFile {
  path: string;
  diff: string; // The git diff patch content
  content: string; // Full file contents
}
```

### How the State flows:

1. **Step 1: Init & Context Builder**
   * Reads target folder/files.
   * Runs local regex scans to fill out `languages` and `dependencies`.
   * Populates `changedFiles` array.

2. **Step 2: Planner (Gemini Object Generation)**
   * We pass the list of files, commit details, and context to Gemini using the Vercel AI SDK `generateObject` API with a Zod schema.
   * Gemini determines the review directives:
     ```typescript
     const planSchema = z.object({
       overallGoals: z.string(),
       files: z.record(z.object({
         skip: z.boolean(),
         focus: z.array(z.string()),
         reason: z.string()
       }))
     });
     ```

3. **Step 3: File Reviewers (Parallel Executions)**
   * For each file where `skip === false`, we execute a Gemini model call concurrently:
     ```typescript
     const commentsResult = await Promise.all(
       changedFiles.map(file => runIndividualReview(file, plan.files[file.path]))
     );
     ```
   * Each thread returns structured JSON containing specific comments linked to exact lines.

4. **Step 4: Cross-File Agent (Gemini Tool Loop)**
   * We initialize Gemini with a system prompt and all `rawComments` gathered from Step 3.
   * Gemini runs in a loop, fetching additional files or searching the codebase using tools.
   * Once Gemini outputs a final text response, we parse any cross-file warnings it identifies.

---

## 5. Local Review Reports (HTML Dashboard UI)

For a superior developer experience in local CLI mode, instead of only generating Markdown, we can write a self-contained, interactive HTML file in the project workspace (e.g. `REVIEW_REPORT.html`).

* **Stack**: A single, beautifully styled HTML file utilizing Tailwind CSS (loaded via CDN) and Alpine.js (for simple interaction).
* **Features**:
  * **Summary Metrics**: High/Medium/Low bug counts and a cost counter.
  * **Accordion Diff Viewer**: Click on an issue to expand and see the code diff with color-highlighted patches.
  * **Code Editor Font Integration**: Fits directly in with dark mode aesthetics (using Courier New / JetBrains Mono styling).
  * **Copy Patch Button**: A one-click button to copy the proposed patch straight to your clipboard.

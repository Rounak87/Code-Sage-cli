from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

OUTPUT = "/mnt/user-data/outputs/AI_Code_Reviewer_Project.pdf"

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=20*mm, bottomMargin=20*mm
)

W, H = A4
styles = getSampleStyleSheet()

# Custom styles
def S(name, **kwargs):
    return ParagraphStyle(name, **kwargs)

DARK = colors.HexColor("#0f172a")
ACCENT = colors.HexColor("#6366f1")
ACCENT2 = colors.HexColor("#10b981")
WARN = colors.HexColor("#f59e0b")
DANGER = colors.HexColor("#ef4444")
LIGHT_BG = colors.HexColor("#f8fafc")
BORDER = colors.HexColor("#e2e8f0")
MUTED = colors.HexColor("#64748b")
WHITE = colors.white

title_style = S("TitleStyle", fontName="Helvetica-Bold", fontSize=28, textColor=WHITE, alignment=TA_CENTER, spaceAfter=6)
subtitle_style = S("SubtitleStyle", fontName="Helvetica", fontSize=13, textColor=colors.HexColor("#c7d2fe"), alignment=TA_CENTER, spaceAfter=4)
h1_style = S("H1", fontName="Helvetica-Bold", fontSize=18, textColor=ACCENT, spaceBefore=18, spaceAfter=8, borderPadding=(0,0,4,0))
h2_style = S("H2", fontName="Helvetica-Bold", fontSize=13, textColor=DARK, spaceBefore=14, spaceAfter=6)
h3_style = S("H3", fontName="Helvetica-Bold", fontSize=11, textColor=ACCENT, spaceBefore=10, spaceAfter=4)
body_style = S("Body", fontName="Helvetica", fontSize=10, textColor=DARK, leading=16, spaceAfter=6, alignment=TA_JUSTIFY)
bullet_style = S("Bullet", fontName="Helvetica", fontSize=10, textColor=DARK, leading=15, spaceAfter=3, leftIndent=14, firstLineIndent=-10)
code_style = S("Code", fontName="Courier", fontSize=8.5, textColor=colors.HexColor("#1e293b"), leading=13, leftIndent=10, spaceAfter=4)
label_style = S("Label", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, alignment=TA_CENTER)
muted_style = S("Muted", fontName="Helvetica", fontSize=9, textColor=MUTED, leading=14, spaceAfter=4)
tag_style = S("Tag", fontName="Helvetica-Bold", fontSize=8, textColor=WHITE, alignment=TA_CENTER)

story = []

# ── COVER PAGE ──────────────────────────────────────────────────────────────
cover_data = [[Paragraph("AI Code Reviewer Agent", title_style)],
              [Paragraph("Full Project Documentation & Architecture Guide", subtitle_style)],
              [Paragraph("Built with GitHub App · Vercel AI SDK · TypeScript · Railway", subtitle_style)]]
cover_table = Table(cover_data, colWidths=[170*mm])
cover_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), ACCENT),
    ("ROUNDEDCORNERS", [8]),
    ("TOPPADDING", (0,0), (-1,-1), 18),
    ("BOTTOMPADDING", (0,0), (-1,-1), 18),
    ("LEFTPADDING", (0,0), (-1,-1), 20),
    ("RIGHTPADDING", (0,0), (-1,-1), 20),
]))
story.append(cover_table)
story.append(Spacer(1, 10*mm))

# Quick stat cards
stats = [
    ("5 Stages", "Pipeline Steps"),
    ("3 AI Agents", "LLM Reasoning Units"),
    ("Vercel AI SDK", "Framework"),
    ("Railway", "Deployment"),
]
stat_cells = [[Paragraph(v, S("sv", fontName="Helvetica-Bold", fontSize=14, textColor=ACCENT, alignment=TA_CENTER)),
               Paragraph(l, S("sl", fontName="Helvetica", fontSize=8, textColor=MUTED, alignment=TA_CENTER))]
              for v, l in stats]
stat_row = [[Table([[c] for c in cell], colWidths=[38*mm]) for cell in stat_cells]]
stat_table = Table(stat_row, colWidths=[42.5*mm]*4)
stat_table.setStyle(TableStyle([
    ("BOX", (0,0), (0,-1), 1, BORDER),
    ("BOX", (1,0), (1,-1), 1, BORDER),
    ("BOX", (2,0), (2,-1), 1, BORDER),
    ("BOX", (3,0), (3,-1), 1, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ("LEFTPADDING", (0,0), (-1,-1), 4),
    ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ("ROUNDEDCORNERS", [6]),
]))
story.append(stat_table)
story.append(Spacer(1, 6*mm))
story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
story.append(Spacer(1, 4*mm))

# ── SECTION 1: WHAT WE ARE BUILDING ─────────────────────────────────────────
story.append(Paragraph("1. What We Are Building", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

story.append(Paragraph(
    "An AI-powered GitHub code reviewer that automatically reviews pull requests like a senior engineer would. "
    "When a developer opens a PR, the system wakes up, understands the full codebase context, creates an intelligent "
    "review plan, analyzes each file deeply, checks cross-file consistency, and posts inline comments directly on the PR — "
    "all within under a minute. This is NOT just sending code to ChatGPT. It is a multi-stage orchestrated reasoning "
    "pipeline with real AI agents that investigate, decide, and act autonomously.", body_style))

story.append(Paragraph("The Problem We Are Solving", h2_style))
bullets = [
    "Code reviews take hours of senior engineer time — this automates the first pass completely.",
    "Generic AI tools just dump advice without understanding your specific project context.",
    "PR review bots today either spam useless comments or miss real bugs because they lack reasoning depth.",
    "Cross-file consistency bugs (schema changed, query not updated) slip through every existing automated tool.",
    "Teams with no senior engineer available still need quality review before merging.",
]
for b in bullets:
    story.append(Paragraph(f"&#x2022;  {b}", bullet_style))

story.append(Paragraph("What Makes This Different From Simple GPT Wrappers", h2_style))
story.append(Paragraph(
    "Most AI code reviewer projects on GitHub do this: grab the diff, send it to GPT, post the response. "
    "That is a wrapper. What we are building has a Planner Agent that thinks before reviewing, "
    "File Reviewer Agents that execute a strategy with context, and a Cross-File Reasoning Agent that "
    "autonomously investigates inconsistencies using real tools. The cross-file agent is a true AI agent — "
    "it decides what to look up next, fetches files on its own, follows chains of dependencies, and only "
    "concludes when it has enough evidence. That is the core differentiator.", body_style))

story.append(PageBreak())

# ── SECTION 2: FULL PIPELINE ─────────────────────────────────────────────────
story.append(Paragraph("2. The Full Pipeline — How It Works", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

pipeline_stages = [
    ("STAGE 1", "Context Builder", ACCENT2, "No LLM — Pure Code",
     "Before any AI call, fetch all changed files, repo structure, package.json / requirements.txt, "
     "detect language and framework. Build a rich context object. This costs zero tokens and makes every "
     "subsequent LLM call dramatically smarter because they start with full understanding."),
    ("STAGE 2", "Planner Agent", ACCENT, "Gemini 2.0 Flash — generateObject",
     "First real LLM call. Given the PR title, changed files, and repo context, this agent produces a "
     "structured review plan: what to focus on overall, which files need deep analysis, which are low risk, "
     "and what specific concerns to look for. Every subsequent agent follows this plan."),
    ("STAGE 3", "File Reviewer Agents", ACCENT, "Gemini 2.0 Flash — generateObject (Parallel)",
     "One agent per changed file, all running in parallel via Promise.all. Each gets the file content, "
     "parsed diff chunks, planner instructions for that specific file, and repo context. Outputs structured "
     "JSON with file, line number, severity, type, comment text, suggested code patch, and confidence score."),
    ("STAGE 4", "Cross-File Reasoning Agent", colors.HexColor("#8b5cf6"), "Claude Sonnet 3.5 — generateText with Tools (TRUE AGENT)",
     "The most advanced stage. This is a real AI agent with tools: fetch_file, search_codebase, "
     "list_directory, get_file_diff, search_imports. It autonomously decides what to investigate, "
     "calls tools, reasons over results, and iterates up to 10 steps before giving a final verdict. "
     "Catches cross-file inconsistencies no other stage can detect."),
    ("STAGE 5", "Comment Poster", ACCENT2, "No LLM — GitHub Review API",
     "Filter comments by confidence score (above 0.65), deduplicate similar feedback, and post all "
     "comments as a single GitHub Pull Request Review with inline line-level annotations. "
     "Feels exactly like a human reviewer leaving comments."),
]

for stage_id, stage_name, color, tech, desc in pipeline_stages:
    row = [[
        Paragraph(stage_id, S("sid", fontName="Helvetica-Bold", fontSize=8, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph(f"<b>{stage_name}</b>", S("sn", fontName="Helvetica-Bold", fontSize=11, textColor=DARK)),
        Paragraph(tech, S("st", fontName="Helvetica", fontSize=8, textColor=MUTED)),
    ]]
    header = Table(row, colWidths=[22*mm, 80*mm, 68*mm])
    header.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), color),
        ("BACKGROUND", (1,0), (-1,-1), LIGHT_BG),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (0,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]))
    desc_row = [[Paragraph(desc, S("sd", fontName="Helvetica", fontSize=9.5, textColor=DARK, leading=14, alignment=TA_JUSTIFY))]]
    desc_table = Table(desc_row, colWidths=[170*mm])
    desc_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), WHITE),
        ("BOX", (0,0), (-1,-1), 0.5, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING", (0,0), (-1,-1), 12),
    ]))
    story.append(header)
    story.append(desc_table)
    story.append(Spacer(1, 6))

story.append(PageBreak())

# ── SECTION 3: AGENTS DEEP DIVE ──────────────────────────────────────────────
story.append(Paragraph("3. The AI Agents — Deep Dive", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

story.append(Paragraph("What Is An AI Agent (In Simple Terms)", h2_style))
story.append(Paragraph(
    "A regular LLM call: you ask a question, you get an answer. Done. "
    "An AI agent: you give it a GOAL and it decides what steps to take, what tools to use, "
    "what to look up, and when it is done — all on its own. The agent has a Role (senior engineer), "
    "Tools (fetch file, search code), Memory (conversation history within the task), and "
    "Autonomy (decides next action based on what it found). That loop of think → act → observe → think again "
    "is what makes something an agent versus a simple LLM call.", body_style))

story.append(Paragraph("Agent 1 — The Planner (Not A True Agent, But Smart)", h2_style))
story.append(Paragraph(
    "This is a single structured LLM call using generateObject. It is not a full agent because it does not "
    "use tools or loop. But it is the intelligence that makes everything else smart. Without it you are "
    "sending every file to a reviewer with no strategy. With it, the reviewer knows exactly what matters "
    "in this specific PR. It outputs a typed JSON plan that TypeScript enforces.", body_style))

story.append(Paragraph("Agent 2 — The File Reviewer (Structured Reasoning)", h2_style))
story.append(Paragraph(
    "Also a single call using generateObject with a Zod schema. Gets file content, diff, planner "
    "instructions. Returns a typed array of comment objects. Runs in parallel for all files. "
    "Not a true agent but a reasoning unit with structured output. The parallelism means a 5-file "
    "PR takes the same time as a 1-file PR.", body_style))

story.append(Paragraph("Agent 3 — Cross-File Reasoner (TRUE AGENT)", h2_style))
story.append(Paragraph(
    "This is where real agentic behavior happens. Uses generateText with tools and maxSteps. "
    "The agent receives the PR context and all file review summaries, then autonomously decides "
    "what to investigate. It can call any of its tools multiple times in any order it chooses. "
    "You set maxSteps: 10 and the Vercel AI SDK handles the entire loop internally.", body_style))

tools_data = [
    ["Tool Name", "What It Does", "When Agent Uses It"],
    ["fetch_file(path)", "Gets full content of any repo file", "Suspects a related file was not updated"],
    ["search_codebase(query)", "Searches entire repo for string/pattern", "Needs to find all callers of a changed function"],
    ["get_file_diff(path)", "Gets diff for a specific file", "Checks if a file was actually changed or not"],
    ["list_directory(path)", "Lists files in a folder", "Checks if migration/test files exist"],
    ["search_imports(module)", "Finds all files importing a module", "Changed module — finds all consumers"],
    ["get_git_history(path)", "Recent commits for a file", "Understands if related changes were made recently"],
]
tools_table = Table(tools_data, colWidths=[42*mm, 72*mm, 56*mm])
tools_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), ACCENT),
    ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT_BG]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
]))
story.append(tools_table)
story.append(Spacer(1, 8))

story.append(Paragraph("What The Cross-File Agent Can Catch That Nothing Else Can", h2_style))
catches = [
    "DB schema changed in models/ but no migration file created in migrations/",
    "API response shape changed but frontend component consuming it was not updated",
    "TypeScript interface modified but not all files importing it were updated",
    "Function renamed in utils/ but old name still called in 3 other files",
    "New env variable used in code but not added to .env.example",
    "Test file does not exist for a newly added critical auth function",
    "Constants file changed but the component using those constants was not in the PR",
]
for c in catches:
    story.append(Paragraph(f"&#x2022;  {c}", bullet_style))

story.append(PageBreak())

# ── SECTION 4: TECH STACK ────────────────────────────────────────────────────
story.append(Paragraph("4. Tech Stack — Every Tool and Why", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

tech_data = [
    ["Technology", "Role", "Why This Choice"],
    ["TypeScript", "Primary language", "Type safety across agents, typed structured outputs, Zod schemas"],
    ["Node.js + Express", "HTTP server / webhook receiver", "Lightweight, fast, huge ecosystem for GitHub integrations"],
    ["Vercel AI SDK", "AI framework", "Free, unified interface for all models, built-in tool calling loop, TypeScript native"],
    ["Gemini 2.0 Flash", "Planner + File Reviewer models", "Cheapest capable model, fast, great structured output, ~$0.10/M tokens"],
    ["Claude Sonnet 3.5", "Cross-File Agent model", "Best multi-step code reasoning, most reliable tool calling, worth the cost"],
    ["BullMQ + Redis", "Job queue", "Webhooks return 200 fast, reviews processed asynchronously, no duplicate processing"],
    ["PostgreSQL + Prisma", "Database + ORM", "Store review history, repo profiles, typed queries, easy migrations"],
    ["Octokit (GitHub App)", "GitHub API client", "Official library, handles JWT auth, installation tokens, all PR APIs"],
    ["Zod", "Schema validation", "Define output shapes for agents, TypeScript types auto-generated, used by Vercel AI SDK"],
    ["Railway", "Deployment platform", "Supports API + Worker + Postgres + Redis in one project, auto HTTPS, GitHub deploy"],
]
tech_table = Table(tech_data, colWidths=[40*mm, 42*mm, 88*mm])
tech_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DARK),
    ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT_BG]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
story.append(tech_table)
story.append(Spacer(1, 8))

story.append(Paragraph("Why Vercel AI SDK Over LangChain", h2_style))
compare_data = [
    ["", "Vercel AI SDK", "LangChain"],
    ["TypeScript quality", "Excellent native types", "Decent but messier"],
    ["Model switching", "One line change", "More code changes needed"],
    ["Agent loop", "Built-in, maxSteps param", "Built-in but more abstraction"],
    ["Debugging", "Easy, transparent", "Hard, many abstraction layers"],
    ["Bundle size", "Lightweight", "Heavy"],
    ["Breaking changes", "Stable", "Frequent updates, breaking changes"],
    ["Cost", "Free", "Free"],
]
compare_table = Table(compare_data, colWidths=[44*mm, 63*mm, 63*mm])
compare_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DARK),
    ("BACKGROUND", (0,0), (0,-1), LIGHT_BG),
    ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("TEXTCOLOR", (0,0), (0,-1), DARK),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT_BG]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
]))
story.append(compare_table)

story.append(PageBreak())

# ── SECTION 5: PROJECT STRUCTURE ─────────────────────────────────────────────
story.append(Paragraph("5. Project Folder Structure", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

structure = """ai-code-reviewer/
├── src/
│   ├── index.ts                     Entry point — Express server setup
│   ├── config/
│   │   └── env.ts                   All environment variables typed
│   ├── controllers/
│   │   └── webhookController.ts     Receives GitHub events, verifies HMAC, queues job
│   ├── services/
│   │   ├── githubService.ts         All GitHub API calls (files, diffs, comments)
│   │   ├── contextBuilder.ts        Stage 1 — builds repo/PR context object
│   │   ├── diffParser.ts            Parses raw diffs into structured chunks + context window
│   │   └── commentPoster.ts         Posts inline review to GitHub PR Review API
│   ├── agents/
│   │   ├── plannerAgent.ts          Stage 2 — generateObject, creates review plan
│   │   ├── fileReviewerAgent.ts     Stage 3 — generateObject, reviews individual files
│   │   └── crossFileAgent.ts        Stage 4 — generateText + tools, true agent loop
│   ├── tools/
│   │   └── repoTools.ts             Tool definitions for cross-file agent (fetch, search, etc.)
│   ├── queue/
│   │   ├── jobQueue.ts              BullMQ queue setup with Redis connection
│   │   └── worker.ts                Processes review jobs, orchestrates full pipeline
│   ├── db/
│   │   ├── schema.ts                TypeScript types for DB models
│   │   └── client.ts                Prisma client singleton
│   └── utils/
│       ├── tokenCounter.ts          Tracks token usage per review for cost monitoring
│       ├── promptTemplates.ts       All system prompts in one place
│       └── webhookVerifier.ts       HMAC-SHA256 signature verification
├── prisma/
│   └── schema.prisma                DB schema — repos, reviews, comments tables
├── .env                             Environment variables (never commit)
├── .env.example                     Template for env vars
├── package.json
├── tsconfig.json
├── Dockerfile                       Multi-stage build for Railway deployment
└── railway.toml                     Railway config — API service + Worker service"""

story.append(Paragraph(structure, S("struct", fontName="Courier", fontSize=8, leading=12,
                                     textColor=DARK, leftIndent=8, spaceAfter=4,
                                     backColor=LIGHT_BG)))
story.append(Spacer(1, 6))

story.append(Paragraph("Key File Responsibilities", h2_style))
files_data = [
    ["File", "What It Does"],
    ["webhookController.ts", "Verifies GitHub signature, extracts PR data, pushes to BullMQ queue, returns 200 instantly"],
    ["contextBuilder.ts", "Fetches changed files, repo structure, dependencies. Returns typed context object. Zero LLM cost."],
    ["plannerAgent.ts", "Single generateObject call. Returns typed review plan with file-specific instructions."],
    ["fileReviewerAgent.ts", "Single generateObject call per file. Returns typed array of comment objects with line numbers."],
    ["crossFileAgent.ts", "generateText with tools + maxSteps:10. True agent loop. Returns cross-file inconsistency findings."],
    ["repoTools.ts", "Tool definitions for cross-file agent — each tool wraps a GitHub API call with Zod input schema."],
    ["worker.ts", "Orchestrates entire pipeline: context → plan → review files → cross-file → post comments."],
    ["commentPoster.ts", "Filters by confidence, deduplicates, posts single GitHub Review with all inline comments."],
]
files_table = Table(files_data, colWidths=[52*mm, 118*mm])
files_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), ACCENT),
    ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("FONTNAME", (0,1), (0,-1), "Courier-Bold"),
    ("FONTNAME", (1,1), (1,-1), "Helvetica"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT_BG]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
story.append(files_table)

story.append(PageBreak())

# ── SECTION 6: DATA FLOW ─────────────────────────────────────────────────────
story.append(Paragraph("6. Data Flow — What Gets Passed Where", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

story.append(Paragraph("Context Object (built in Stage 1, used by everyone)", h2_style))
ctx_code = """{
  language: "TypeScript",
  framework: "Next.js",
  dependencies: ["prisma", "next-auth", "zod", "trpc"],
  changed_files: ["src/auth/login.ts", "src/db/user.ts", "src/ui/button.tsx"],
  repo_structure: "src/, prisma/, public/, tests/",
  pr_title: "Add OAuth login with Google",
  pr_description: "Implements Google OAuth flow...",
  total_files_changed: 3
}"""
story.append(Paragraph(ctx_code, code_style))

story.append(Paragraph("Planner Output (used by File Reviewer Agents)", h2_style))
plan_code = """{
  overall_focus: "Auth flow security and session token handling",
  risk_level: "HIGH",
  files: {
    "src/auth/login.ts": { depth: "deep", focus: ["input validation", "token expiry", "error handling"] },
    "src/db/user.ts":    { depth: "deep", focus: ["SQL injection", "data exposure"] },
    "src/ui/button.tsx": { depth: "light", focus: ["no logic concerns"] }
  }
}"""
story.append(Paragraph(plan_code, code_style))

story.append(Paragraph("File Reviewer Output (used by Cross-File Agent + Comment Poster)", h2_style))
review_code = """{
  file: "src/auth/login.ts",
  comments: [
    {
      line: 42,
      severity: "HIGH",
      type: "Security Issue",
      comment: "JWT token has no expiry set. Tokens last forever and cannot be invalidated.",
      suggested_patch: "jwt.sign(payload, secret, { expiresIn: '7d' })",
      confidence: 0.92
    },
    {
      line: 67,
      severity: "MEDIUM",
      type: "Logic Error",
      comment: "Error thrown here is swallowed silently. User sees no feedback on failed login.",
      suggested_patch: "throw new AuthError('Invalid credentials')",
      confidence: 0.81
    }
  ]
}"""
story.append(Paragraph(review_code, code_style))

story.append(Paragraph("Cross-File Agent — How It Reasons (Example)", h2_style))
story.append(Paragraph(
    "Agent receives all file summaries. It notices the DB user model was changed. "
    "It calls fetch_file('prisma/schema.prisma') on its own to check the schema. "
    "It then calls list_directory('prisma/migrations') and finds no new migration. "
    "It calls search_codebase('findUnique') to check if queries match the new schema. "
    "It finds 3 files with outdated queries. It concludes with a HIGH severity finding. "
    "You never told it to do any of this — it decided the investigation path itself.", body_style))

story.append(PageBreak())

# ── SECTION 7: COST ──────────────────────────────────────────────────────────
story.append(Paragraph("7. Cost Analysis", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

cost_data = [
    ["Stage", "Model", "Est. Tokens/PR", "Cost/PR", "Notes"],
    ["Context Builder", "No LLM", "0", "$0.000", "Pure GitHub API calls"],
    ["Planner Agent", "Gemini 2.0 Flash", "~1,500", "$0.0002", "Single structured call"],
    ["File Reviewers (5 files)", "Gemini 2.0 Flash", "~15,000", "$0.002", "Parallel, 5x calls"],
    ["Cross-File Agent", "Claude Sonnet 3.5", "~20,000", "$0.06", "10 tool call iterations"],
    ["Comment Poster", "No LLM", "0", "$0.000", "Pure GitHub API calls"],
    ["TOTAL PER PR", "", "~36,500", "~$0.062", "About 6 cents per full review"],
]
cost_table = Table(cost_data, colWidths=[44*mm, 36*mm, 30*mm, 20*mm, 40*mm])
cost_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DARK),
    ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#ecfdf5")),
    ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("TEXTCOLOR", (0,-1), (-1,-1), ACCENT2),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("FONTNAME", (0,1), (-1,-2), "Helvetica"),
    ("ROWBACKGROUNDS", (0,1), (-1,-2), [WHITE, LIGHT_BG]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("ALIGN", (2,0), (3,-1), "CENTER"),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
]))
story.append(cost_table)
story.append(Spacer(1, 6))

story.append(Paragraph("At 100 PRs/month = ~$6. At 1000 PRs/month = ~$60. Very sustainable.", 
    S("highlight", fontName="Helvetica-Bold", fontSize=10, textColor=ACCENT2, spaceAfter=8)))

story.append(Paragraph("Cost Optimization Strategies", h2_style))
cost_tips = [
    "Only send changed file chunks (40-50 lines around diff) not entire files to reviewers",
    "Skip light-depth files from the cross-file agent entirely — planner decides this",
    "Cache context objects per commit SHA so re-runs don't re-fetch everything",
    "Use Gemini Flash for file reviewers — quality is good enough, cost is 30x cheaper than GPT-4o",
    "Set confidence threshold at 0.65 — only post high-confidence comments, fewer tokens wasted on noise",
    "Summarize tool results before appending to agent context — prevent context window blowup",
]
for t in cost_tips:
    story.append(Paragraph(f"&#x2022;  {t}", bullet_style))

story.append(PageBreak())

# ── SECTION 8: PROBLEMS & SOLUTIONS ─────────────────────────────────────────
story.append(Paragraph("8. Problems You Will Face and How To Handle Them", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

problems = [
    ("Agent Loops Infinitely", DANGER,
     "Cross-file agent keeps calling tools without concluding.",
     "maxSteps: 10 in Vercel AI SDK hard stops it. If limit hit, use whatever findings exist so far. Always works."),
    ("Duplicate PR Comments", WARN,
     "Agent posts same feedback twice or posts on re-runs.",
     "Before posting, fetch existing PR comments and deduplicate. Store review per commit SHA in DB."),
    ("GitHub Webhook Retries", WARN,
     "Review takes 30s. GitHub retries webhook thinking server is down. Causes duplicate reviews.",
     "Queue system (BullMQ). Webhook returns 200 instantly. Worker processes asynchronously. Job has unique PR+commit ID key."),
    ("Large Files Blow Token Limit", DANGER,
     "1000-line file sent to reviewer — hits context window limit or costs too much.",
     "Diff parser extracts only 40-50 lines around each changed chunk. Never send full files. Summarize if needed."),
    ("Hallucinated Tool Arguments", WARN,
     "Agent calls fetch_file with a path that does not exist in the repo.",
     "Tool functions return descriptive errors like 'File not found at path X'. Agent reads error and adjusts."),
    ("Low Quality Comments Posted", DANGER,
     "Agent posts generic or obvious advice, destroying trust in the tool.",
     "Confidence score filter (above 0.65 only). Good system prompt explicitly banning generic advice. Deduplicate."),
    ("HMAC Verification Fails", DANGER,
     "Webhook rejects legitimate GitHub events or accepts forged ones.",
     "Use crypto.timingSafeEqual for HMAC comparison. Never string compare. Store secret in env variable only."),
    ("Token Count Explodes on Large PRs", WARN,
     "PR with 20 changed files sends too many tokens across all agents.",
     "Cap at 10 files max per review run. Planner flags only important ones. Queue the rest or skip low-risk ones."),
]

for title, color, problem, solution in problems:
    row_data = [
        [Paragraph(f"<b>{title}</b>", S("pt", fontName="Helvetica-Bold", fontSize=10, textColor=WHITE)),
         Paragraph(f"<b>Problem:</b> {problem}", S("pp", fontName="Helvetica", fontSize=9, textColor=DARK, leading=13)),],
        ["",
         Paragraph(f"<b>Solution:</b> {solution}", S("ps", fontName="Helvetica", fontSize=9, textColor=DARK, leading=13)),],
    ]
    t = Table(row_data, colWidths=[28*mm, 142*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), color),
        ("BACKGROUND", (1,0), (1,0), colors.HexColor("#fff1f2") if color==DANGER else colors.HexColor("#fffbeb")),
        ("BACKGROUND", (1,1), (1,1), WHITE),
        ("SPAN", (0,0), (0,-1)),
        ("VALIGN", (0,0), (0,-1), "MIDDLE"),
        ("ALIGN", (0,0), (0,-1), "CENTER"),
        ("GRID", (0,0), (-1,-1), 0.5, BORDER),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
    ]))
    story.append(t)
    story.append(Spacer(1, 5))

story.append(PageBreak())

# ── SECTION 9: DEPLOYMENT ────────────────────────────────────────────────────
story.append(Paragraph("9. Deployment Plan", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

story.append(Paragraph("Platform — Railway", h2_style))
story.append(Paragraph(
    "Railway is the best fit for this project. One Railway project contains multiple services "
    "that share a private internal network. You deploy: an API service (Express webhook receiver), "
    "a Worker service (BullMQ job processor), a Postgres database, and a Redis instance. "
    "Railway provides automatic HTTPS, GitHub-connected deploys, environment variable management, "
    "and built-in logging. Free tier works for development. Production costs around $5-10/month.", body_style))

deploy_data = [
    ["Service", "Start Command", "Purpose"],
    ["API Service", "npm run start:api", "Receives GitHub webhooks, returns 200 immediately, pushes to queue"],
    ["Worker Service", "npm run start:worker", "Processes review jobs, runs full pipeline, posts comments"],
    ["PostgreSQL", "Managed by Railway", "Stores review history, repo profiles, comment records"],
    ["Redis", "Managed by Railway", "BullMQ job queue backing store, fast in-memory job state"],
]
deploy_table = Table(deploy_data, colWidths=[38*mm, 48*mm, 84*mm])
deploy_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DARK),
    ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT_BG]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 7),
    ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
]))
story.append(deploy_table)
story.append(Spacer(1, 8))

story.append(Paragraph("Environment Variables Required", h2_style))
env_data = [
    ["Variable", "Where To Get It"],
    ["GITHUB_APP_ID", "GitHub App settings page after creating the app"],
    ["GITHUB_PRIVATE_KEY", "Download .pem from GitHub App, paste full contents as string"],
    ["GITHUB_WEBHOOK_SECRET", "You generate this — any random secret string, set in GitHub App too"],
    ["OPENAI_API_KEY", "platform.openai.com — if using OpenAI for any agents"],
    ["ANTHROPIC_API_KEY", "console.anthropic.com — for Claude Sonnet cross-file agent"],
    ["GEMINI_API_KEY", "aistudio.google.com — for Gemini Flash planner/reviewer agents"],
    ["DATABASE_URL", "Auto-provided by Railway Postgres service"],
    ["REDIS_URL", "Auto-provided by Railway Redis service"],
    ["NODE_ENV", "Set to 'production' on Railway"],
]
env_table = Table(env_data, colWidths=[58*mm, 112*mm])
env_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), ACCENT),
    ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTNAME", (0,1), (0,-1), "Courier-Bold"),
    ("FONTNAME", (1,1), (1,-1), "Helvetica"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT_BG]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
]))
story.append(env_table)
story.append(Spacer(1, 8))

story.append(Paragraph("Build & Deploy Steps", h2_style))
deploy_steps = [
    "Create GitHub App in GitHub Developer Settings — set webhook URL to your Railway API URL",
    "Set permissions: Read (code, pull requests), Write (pull request reviews)",
    "Push code to GitHub repo — Railway auto-deploys on every push",
    "Set all environment variables in Railway dashboard",
    "Install your GitHub App on a test repo",
    "Open a PR — webhook fires, job queues, worker processes, comments appear on PR",
]
for i, s in enumerate(deploy_steps, 1):
    story.append(Paragraph(f"{i}.  {s}", bullet_style))

story.append(PageBreak())

# ── SECTION 10: OUTPUT ───────────────────────────────────────────────────────
story.append(Paragraph("10. What The Output Looks Like", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

story.append(Paragraph("On The GitHub Pull Request", h2_style))
story.append(Paragraph(
    "The reviewer posts a single GitHub Pull Request Review — not individual scattered comments. "
    "This review contains an overall summary at the top, and then inline comments pinned to "
    "exact line numbers in the diff. Each inline comment has the issue description and a "
    "suggested code patch that GitHub shows as a one-click 'Apply suggestion' button. "
    "It looks identical to a human engineer reviewing the PR.", body_style))

output_data = [
    ["Comment Field", "Example Value"],
    ["File", "src/auth/login.ts"],
    ["Line", "42"],
    ["Severity", "HIGH"],
    ["Type", "Security Issue"],
    ["Comment", "JWT token has no expiry set. This token never expires and cannot be revoked. Any compromised token is valid forever."],
    ["Suggested Patch", "jwt.sign(payload, secret, { expiresIn: '7d', issuer: 'your-app' })"],
    ["Confidence", "0.92"],
]
out_table = Table(output_data, colWidths=[38*mm, 132*mm])
out_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,0), DARK),
    ("TEXTCOLOR", (0,0), (-1,0), WHITE),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTNAME", (0,1), (0,-1), "Helvetica-Bold"),
    ("FONTNAME", (1,1), (1,-1), "Helvetica"),
    ("FONTSIZE", (0,0), (-1,-1), 9),
    ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT_BG]),
    ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ("TOPPADDING", (0,0), (-1,-1), 6),
    ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ("LEFTPADDING", (0,0), (-1,-1), 8),
    ("VALIGN", (0,0), (-1,-1), "TOP"),
    ("TEXTCOLOR", (1,2), (1,2), DANGER),
]))
story.append(out_table)

story.append(PageBreak())

# ── SECTION 11: FUTURE IMPROVEMENTS ─────────────────────────────────────────
story.append(Paragraph("11. Future Improvements (V2 and Beyond)", h1_style))
story.append(HRFlowable(width="100%", thickness=1.5, color=ACCENT))
story.append(Spacer(1, 4))

future = [
    ("Per-Repo Memory Profile", "Store patterns specific to each codebase. If a repo has custom auth, the planner knows this for every future review. Makes reviews increasingly tailored over time."),
    ("Web Dashboard", "Show review history per repo, comment acceptance rate, most common issue types, cost per repo. Makes the tool feel like a product not just a script."),
    (".reviewerrc Config File", "Allow repos to configure the reviewer via a config file committed to the repo. Like ESLint config — specify what to focus on, what to ignore, severity thresholds."),
    ("Learning From Feedback", "When a developer dismisses a comment or applies a suggestion, record that. Use it to tune confidence thresholds and improve future reviews."),
    ("PR Summary Generation", "Auto-generate a PR description if the author left it blank. Summarize what changed and why based on the code analysis."),
    ("Slack / Email Notifications", "Notify team when high severity issues are found. Integration with existing engineering workflow tools."),
    ("Multi-Model Benchmarking", "Run the same PR through Gemini, Claude, and GPT-4o. Compare outputs. Automatically route to the model with best quality/cost ratio per task type."),
]
for title, desc in future:
    story.append(Paragraph(f"<b>{title}</b>", S("ft", fontName="Helvetica-Bold", fontSize=10, textColor=ACCENT, spaceAfter=2, spaceBefore=8)))
    story.append(Paragraph(desc, body_style))

story.append(Spacer(1, 8))
story.append(HRFlowable(width="100%", thickness=1, color=BORDER))
story.append(Spacer(1, 6))

footer = Paragraph(
    "AI Code Reviewer Agent — Full Project Documentation | Built with Vercel AI SDK, GitHub App, TypeScript, Railway",
    S("footer", fontName="Helvetica", fontSize(8, textColor=MUTED, alignment=TA_CENTER))
)

# Fix syntax error in footer
footer = Paragraph(
    "AI Code Reviewer Agent — Full Project Documentation | Built with Vercel AI SDK, GitHub App, TypeScript, Railway",
    S("footer2", fontName="Helvetica", fontSize=8, textColor=MUTED, alignment=TA_CENTER)
)
story.append(footer)

doc.build(story)
print("PDF generated successfully")

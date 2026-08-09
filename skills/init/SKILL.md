---
name: init
description: Use when setting up a new project to use the project-workflows plugin, or to update existing project configuration
---

You are configuring the `project-workflows` plugin for a project. Your first job is to detect whether this is a fresh setup or an update to existing configuration.

> **Note on `AskUserQuestion`:** This skill calls `AskUserQuestion` for multi-select questions (skill selection, optional section selection). This is a native Claude Code tool available in all plugin contexts. For other questions, ask conversationally in your response text.

---

## Step 1: Detect Mode

Read the filesystem to determine the mode:

1. Check if `.claude/project-config/PROJECT.md` exists.
2. If it exists, check whether its first line contains `<!-- pw-version:`.

**Mode routing:**

- **PROJECT.md does not exist** → proceed to **Fresh Init** (Step 2).
- **PROJECT.md exists with `<!-- pw-version:`** → the project is already configured (update mode): skip Steps 2–10, Read `./references/update-mode.md` and follow it.
- **PROJECT.md exists without `<!-- pw-version:`** → it was created by the old init skill (no interview). Ask the user:

  > "I found existing config files that were created without the interactive setup. Would you like to:
  > (a) **Replace them** — run the full interview and generate fresh config (existing content will be overwritten)
  > (b) **Keep them** — enter update mode to inspect and edit individual sections"

  If they choose (a), proceed to **Fresh Init** (Step 2). If (b), skip Steps 2–10, Read `./references/update-mode.md` and follow it.

---

## Step 2: Fresh Init — Welcome

Tell the user:

> "I'll walk you through setting up the project-workflows plugin configuration. I'll ask questions in groups and generate your config files as we go. Most questions have a 'skip for now' option — you can always run `/project-workflows:init` again to fill in skipped sections.
>
> This will configure:
> - **PROJECT.md** — the central project reference (required for all skills)
> - **.env / .env.example** — API token configuration
> - **STANDARDS.md** — if you plan to use the `code-review` skill
> - **TEST-MATRIX.md** — if you plan to use the `testing-static`, `testing-spec`, or `testing-prd` skills
> - **SPEC-MANIFEST.md** — if you plan to use the `testing-spec` skill
> - **PRD-MANIFEST.md** — if you plan to use the legacy `testing-prd` skill"

---

## Step 3: Fresh Init — Project Identity & Source Control

Ask the user the following questions (use `AskUserQuestion` tool for the platform selection; ask the others as a conversational grouped prompt):

**Conversational grouped prompt:**
> "Let's start with the basics. Please provide:
>
> 1. **Project name** — the human-readable name for this project
> 2. **Architecture overview** — a brief description of your major components, how they communicate (REST, gRPC, message queues, etc.). An ASCII diagram is ideal but a prose description works too.
> 3. **Source control platform** — GitLab, GitHub, or Gitea?
> 4. **Instance URL** — for hosted GitHub.com/GitLab.com just say 'hosted'; for self-hosted, provide the URL (e.g. `https://gitlab.company.com`)
> 5. **Group / organization name** — the group or org that owns your repos (e.g. `my-org`)"

From the answers, **derive automatically** (do not ask):
- `API_BASE_URL`: GitLab → `<instance>/api/v4`; GitHub hosted → `https://api.github.com`; GitHub Enterprise → `<instance>/api/v3`; Gitea → `<instance>/api/v1`
- `GROUP_DASHBOARD`: `<instance>/groups/<group>` (GitLab) or `<instance>/orgs/<org>` (GitHub/Gitea)
- Which API reference skill to mention: `project-workflows:gitlab-api` / `project-workflows:github-api` / `project-workflows:gitea-api`

**Generate immediately:** Read `./templates/PROJECT.md` — the canonical emittable skeleton — and write it to `.claude/project-config/PROJECT.md`, populated from the answers: substitute each `{placeholder}` with its derived value, and expand every `{not-configured stanza}` to the exact two-line marker defined by the **Not-Configured Marker** in `./references/file-generation-rules.md`. The template's `{not-configured stanza}` tokens mark sections not yet collected. Keep the first line — the `<!-- pw-version: ... -->` version stamp — and all 15 `##` headings exactly as written, in order: they are the canonical **Required Section Headings** in `./references/file-generation-rules.md`. For a fuller per-section structural reference with fill-in examples, see `./references/project-md-reference.md`.

Confirm to the user: "PROJECT.md created with your project identity and source control settings."

---

## Step 4: Fresh Init — Repositories

Ask the user the following conversational prompt:

> "Now let's add your repositories. Please list them in the following format — you can add all at once or one at a time:
>
> **For each repository:**
> - Name (e.g. `my-api`)
> - Local path on disk (e.g. `/workspace/my-project/my-api`)
> - Role/description (what does this repo do?)
> - Primary language & framework (e.g. Go + Gin, TypeScript + Next.js)"

Once you have at least one repo, follow up for each repo:

> "For `{repo_name}`, a few more details:
> - **Key paths** — important directories or files (e.g. `cmd/server/main.go`, `internal/`, `src/`)
> - **Key libraries** — major dependencies beyond the framework
> - **Test framework** — (e.g. Go's `testing`, Jest, Pytest)
> - **Build tool** — (e.g. `go build`, `npm run build`, `cargo build`)
> - **Commands** — lint, test, build, run commands
> - **CI stages** — (e.g. `lint → test → build → deploy`)
>
> Skip any you don't know yet."

After each repo, ask: "Any more repositories to add? (yes/no)"

If 2+ repos, ask: "What's the merge order when a change spans multiple repos? List repo names from most upstream (least dependencies) to most downstream."

**Generate:** Update PROJECT.md by replacing the `## Repository Locations`, `## Repository Dependency Order`, and `## Tech Stacks Per Repo` sections using the `Edit` tool, following the structures in `./references/section-templates.md`.

**Repository Dependency Order** applies only if 2+ repos. If single repo, write: "Single repository — no dependency ordering needed."

For any field the user skipped, write `not specified`.

Confirm: "Added {N} repositories to PROJECT.md."

---

## Step 5: Fresh Init — Infrastructure

Ask as a single conversational grouped prompt:

> "A few infrastructure questions:
>
> 1. **Worktrees base directory** — the parent directory where your repos live and where git worktrees will be created (e.g. `/workspace/my-project`). This is used by the `development` skill for concurrent session isolation.
> 2. **Deploy/infrastructure repo** — which repo holds your Docker Compose or deployment configuration? (or 'none' if you don't use Docker Compose)
> 3. **Container registry URL** — (e.g. `registry.gitlab.com` or `ghcr.io`) or 'none'
> 4. **If you have a deploy repo**: what command starts your infrastructure? (e.g. `docker compose up -d`)
> 5. **Database migration command** — (e.g. `docker exec db migrate up`) or 'none'
> 6. **Seed data command** — (e.g. `docker exec db seed`) or 'none'"

**Generate:** Update PROJECT.md using `Edit` tool:

**Concurrent Session Isolation section:** Replace the `<!-- not-configured -->` stub with the full worktree documentation from the template, substituting `{worktrees_base}` for all occurrences of `<WORKTREES_BASE>`. The section structure must be preserved exactly (Why worktrees, Directory convention, Creating a worktree, Preserving relative paths, Working in the worktree, Sub-agents, Cleanup, Caveats). Use the first repo from Phase 4 as the example `<REPO_NAME>` in the template commands. If no repos were collected in Phase 4, leave `<REPO_NAME>` as a literal placeholder and add a comment: `<!-- Replace <REPO_NAME> with your primary repository name -->`.

**Container Registry section:** If a registry was provided, generate the `## Container Registry` section using the structure in `./references/section-templates.md`. If none, write: "## Container Registry\n\nNo container registry configured."

**Local Development section:** If a deploy repo was provided, generate the `## Local Development` section using the structure in `./references/section-templates.md`. If no deploy repo, note that there is no Docker Compose stack configured.

Confirm: "Infrastructure sections updated in PROJECT.md."

---

## Step 6: Fresh Init — Optional Sections

Ask the user (use `AskUserQuestion` tool with multi-select):

> "Which additional sections of PROJECT.md would you like to fill in now? (You can always add these later by running `/project-workflows:init` again)"
>
> Options:
> - Domain Concepts (terminology definitions, signal-to-repo routing, PRD directory path) — needed for `issue-creation` skill routing
> - Work Item Conventions (hierarchy & typing, lifecycle & status, comment & body conventions) — optional guidance for the `work-item` skill
> - API Endpoints (table of your service's primary API endpoints)
> - Database Schema (table of database tables and their purpose)
> - Cross-Cutting Concerns (auth flow, message queues, caching, shared data models)
> - Design Documentation (paths to your architecture docs, diagrams, PRDs)
> - Git Tags (current version tags per repo)
> - Skip all for now

For each selected section, ask a focused conversational prompt and generate the section content. Structure each section exactly as below:

**Domain Concepts** — Ask:
> "For Domain Concepts:
> - List key domain terms and their definitions (term | definition | where it's used in the codebase)
> - For issue routing: what domain signals (keywords, feature areas) map to which repo?
> - What's the path to your PRD files directory? (or 'none')"

Generate the `## Domain Concepts` section using the structure in `./references/section-templates.md`.

**Work Item Conventions** — Ask:
> "For Work Item Conventions (all host-agnostic; skip any that don't apply):
> - **Hierarchy & typing:** what are your work-item levels (e.g. epic → story → task), how is item type expressed (e.g. `type::` scoped labels), how are parent/child links formed, and what orthogonal label axes (priority, component, status) do you use?
> - **Lifecycle & status:** what status values does a work item move through, how is the next item to work on selected, and what are the advance/close transitions?
> - **Comment & body conventions:** what should a well-formed item body contain, and what are your comment conventions (prefixes, status-update format, links to commits/branches/change requests)?"

Generate the `## Work Item Conventions` section using the structure in `./references/section-templates.md`.

**API Endpoints** — Ask:
> "List your primary API endpoints: method, path, description, auth required (yes/no), which service handles it."

Generate the `## API Endpoints` section using the structure in `./references/section-templates.md`.

**Database Schema** — Ask:
> "List your database tables: table name, purpose, key columns. Add a note if you have multiple databases."

Generate the `## Database Schema` section using the structure in `./references/section-templates.md`.

**Cross-Cutting Concerns** — Ask:
> "Describe your cross-cutting architectural patterns:
> - Auth flow (how users authenticate, token storage, token refresh, auth failure handling)
> - Message queue / event streaming (if applicable: consumer strategy, retry policy, queue names)
> - Caching strategy (if applicable: what is cached, invalidation)
> - Shared data models (data structures shared across services)"

Generate the `## Cross-Cutting Concerns` section using the structure in `./references/section-templates.md`.

**Design Documentation** — Ask:
> "Where are your architecture docs, diagrams, and implementation plans stored? Provide paths (relative to worktrees base or absolute)."
> "Which documentation profile should this project use — `lite` (PRD only), `standard` (PRD + SDD; the default), or `full` (adds TSD + a project BRD)? See the taxonomy in `shared/documentation-taxonomy.md`."
> "What is your docs root (default `docs/`), and where do specs live (PRD directory, `.feature` globs, issue references) for `testing-spec`?"

Generate the `## Design Documentation` section using the structure in `./references/section-templates.md` (the profile, docs root, and spec sources are `###` subsections — do **not** add a new `##` heading).

**Git Tags** — Ask:
> "What are the current version tags for each repo, and what versioning scheme do you use (semver, calendar, etc.)?"

Generate the `## Git Tags` section using the structure in `./references/section-templates.md`.

For any section the user **skipped**, leave the `<!-- not-configured -->` stub in place.

Confirm which sections were filled and which were skipped.

---

## Step 7: Fresh Init — Skills & Secondary Config Files

Ask the user (use `AskUserQuestion` tool with multi-select):

> "Which `project-workflows` skills do you plan to use? This determines which additional config files I'll generate."
>
> Options:
> - `development` — implement features and fix bugs (uses PROJECT.md only — already done)
> - `issue-creation` — create well-structured issues (uses PROJECT.md only — already done)
> - `code-review` — automated code review (needs STANDARDS.md)
> - `testing-static` — integration testing with static test matrix (needs TEST-MATRIX.md)
> - `testing-spec` — integration testing from specs: PRDs, issues, `.feature` files (needs TEST-MATRIX.md + SPEC-MANIFEST.md)
> - `testing-prd` — integration testing driven by your PRDs (needs TEST-MATRIX.md + PRD-MANIFEST.md; superseded by `testing-spec`)

**For `code-review`:** Generate `.claude/project-config/STANDARDS.md` by **reading the template** at `skills/init/templates/STANDARDS.md` (in the same plugin directory as this skill file). This template is the **single source** — do not inline its content here. Keep its `<!-- pw-version: 1.5.0 -->` first line and its `## Universal Principles` table.

**Interactive Universal Principles.** Present the seed Universal Principles rows from the template and ask the user to tailor them:

> "Here are the seed Universal Principles applied to every repo: {list each seed row's Category — Severity}. Would you like to **add** any project-specific principles, or **remove** any seed rows you don't want? (`Severity` is read only by `code-review`, as a floor; `issue-creation` and `development` apply every row and ignore it.)"

Apply their answers — for each added principle collect a Category, a "What to check" description, and a `Severity` floor (`critical`/`warning`/`suggestion`); drop any seed rows they reject — then write the final `## Universal Principles` table.

**Per-repo sections.** Expand the template's per-repo `## <REPO_NAME>` block into one `## {repo_name}` section for each repository collected in Step 4 (do not write a for-loop literally; expand it into actual sections), on the same `Category | What to check | Severity` schema:

```
## {repo_name}

| Category | What to check | Severity |
|----------|---------------|----------|
| <!-- Add repo-specific standards here --> | <!-- What to verify --> | <!-- critical | warning | suggestion --> |

> Run `/project-workflows:init` and select "Configure code-review" to fill in repo-specific standards interactively.
```

Then ask: "Would you like to fill in repo-specific standards for any of your repos now? If yes, tell me which repos, the checks that matter most for each (common mistakes in the tech stack, project conventions), and a `Severity` for each." If they provide standards, update the relevant `## {repo_name}` sections with populated rows.

**For `testing-static`, `testing-spec`, or `testing-prd`:** Generate `.claude/project-config/TEST-MATRIX.md`:

Read the template file at `skills/init/templates/TEST-MATRIX.md` (in the same plugin directory as this skill file) to get the exact structure. Add `<!-- pw-version: 1.5.0 -->` as the first line of the generated file, then pre-fill what you know from earlier phases:

- **Docker Compose Startup Sequence:** Replace `<WORKTREES_BASE>` with the actual worktrees base from Step 5. Replace `<DEPLOY_REPO>` with the deploy repo from Step 5. Fill in the migration command (Step 4) and seed command (Step 5) if provided; otherwise leave the `<!-- REPLACE THIS -->` markers.
- **All `<!-- REPLACE THIS: ... -->` comment blocks:** Keep them in place so the user knows what to fill in. Do NOT remove these markers — they are review prompts for the user.

Tell the user: "I've generated TEST-MATRIX.md with your infrastructure pre-filled. The `<!-- REPLACE THIS: ... -->` markers show sections that need your specific service details (container names, ports, health endpoints, browser test flows). Review the file and fill these in."

**For `testing-prd`:** Also generate `.claude/project-config/PRD-MANIFEST.md`.

Ask:
> "For the PRD-MANIFEST, I need your feature categories. For each feature area in your project, provide:
> - Category name (e.g. 'User Authentication')
> - Short ID prefix (3–6 chars, e.g. 'AUTH-')
> - Which PRD file covers it (filename or pattern)
> - Test method (curl HTTP calls, Playwright, etc.)
> - Priority: Must Have / Should Have / Nice to Have"

Read the template at `skills/init/templates/PRD-MANIFEST.md` (in the same plugin directory as this skill file). Generate PRD-MANIFEST.md with that full static content, add `<!-- pw-version: 1.5.0 -->` as the first line, and replace the `<!-- REPLACE THIS -->` blocks in `## Test ID Prefixes` and `## Feature Priorities` with populated tables from the user's answers.

**For `testing-spec`:** Generate `.claude/project-config/SPEC-MANIFEST.md` from `skills/init/templates/SPEC-MANIFEST.md`. Keep the `<!-- pw-version: 1.5.0 -->` first line, fill the **Spec Sources** table from the docs root and spec sources captured in the Design Documentation step (PRD directory, `.feature` globs, issue references), and replace the `<!-- REPLACE THIS -->` blocks in `## Test ID Prefixes` and `## Feature Priorities` from the user's answers. Retain the `PRD-MANIFEST.md` template this release — `testing-spec` reads `SPEC-MANIFEST.md` and falls back to a legacy `PRD-MANIFEST.md`.

**For any skill NOT selected:** Still create the config file (so it exists and is discoverable) but with a clear header:
```
<!-- pw-version: 1.5.0 -->
<!-- pw-status: not-configured -->
> **Note:** This file has not been configured yet. Run `/project-workflows:init` and select the relevant skill to set it up interactively.
```

---

## Step 8: Fresh Init — Environment Setup

Always generate `.claude/project-config/.env.example` with:
```
# project-workflows environment variables
# Copy this file to .env and fill in the values before using operational skills.

# Your repository host API token (GitHub/GitLab/Gitea personal access token)
API_TOKEN_ENV_VAR=

# Review/approval token used by project-workflows:code-review (optional; leave empty to reuse API_TOKEN_ENV_VAR)
REVIEW_TOKEN_ENV_VAR=

# Self-hosted instance base URL (GitHub Enterprise, self-hosted GitLab/Gitea only)
# Leave empty for hosted GitHub/GitLab.com
REPO_HOST_URL=
```

Ask the user:
> "Would you like to create your `.env` file now? It will be written directly to `.claude/project-config/.env` — your token will not be stored anywhere else. (Make sure `.claude/project-config/.env` is in your `.gitignore`.) If yes, provide your API token value."

If yes: create `.claude/project-config/.env` with `API_TOKEN_ENV_VAR={token}` and the other two variables empty with comments.

If no: note that they should copy `.env.example` to `.env` and fill in `API_TOKEN_ENV_VAR` before using any operational skill.

---

## Step 9: Fresh Init — Update CLAUDE.md

Check if `CLAUDE.md` exists in the project root.

- If it does **not** exist: create it as an empty file, then append the section below.
- If it **already exists**: check whether `## Project Workflows Configuration` heading is present. If it is, skip and tell the user. If not, append the section.

**Gitignore update:** Apply the **Gitignore Rule** in `./references/file-generation-rules.md` to ensure `.gitignore` contains `.state-tracking/`.

**State directory:** Run `mkdir -p <PRIMARY_REPO_LOCAL_PATH>/.state-tracking/` to create the directory up-front so it exists before any skill writes state.

**Docs tree:** Scaffold the documentation subtree under the docs root captured in the Design Documentation step (default `docs/`). Create the spec/PRD subdirectory (e.g. `docs/prd/`) and, if the profile is `standard` or `full`, a design subdirectory (e.g. `docs/design/`) with `mkdir -p`. **Never clobber existing `docs/` content** — any current `docs/contributing`, `docs/troubleshooting`, or other files must be left untouched; only add missing directories. Do not create documents here — the `documentation` skill authors those on demand.

Read `./references/claude-md-block.md` and append its contents verbatim to the project's `CLAUDE.md`.

---

## Step 10: Fresh Init — Summary

Print a tailored completion summary:

```
## Setup Complete

### Configured
- PROJECT.md — {list which sections were fully populated}
- .env.example — generated
{list other config files generated}

### Needs Your Attention
{For each <!-- REPLACE THIS --> marker left in TEST-MATRIX.md, list the section}
{For each <!-- not-configured --> section in PROJECT.md, list it}
{If .env was not created: "Copy .env.example to .env and fill in API_TOKEN_ENV_VAR"}

### Skipped (configure later with /project-workflows:init)
{list any skills/sections the user deferred}

### Next Steps
1. {If PROJECT.md sections are unfilled}: Fill in the remaining sections of PROJECT.md
2. {If TEST-MATRIX.md has REPLACE THIS markers}: Review TEST-MATRIX.md and fill in service-specific checks
3. {If .env not yet created}: Copy .env.example → .env and add your API token
4. You're ready to use: {list the skills that are now configured}
```

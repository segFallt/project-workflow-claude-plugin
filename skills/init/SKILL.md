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
- **PROJECT.md exists with `<!-- pw-version:`** → skip Steps 2–10 and proceed to the **Update Mode** section at the bottom of this skill.
- **PROJECT.md exists without `<!-- pw-version:`** → it was created by the old init skill (no interview). Ask the user:

  > "I found existing config files that were created without the interactive setup. Would you like to:
  > (a) **Replace them** — run the full interview and generate fresh config (existing content will be overwritten)
  > (b) **Keep them** — enter update mode to inspect and edit individual sections"

  If they choose (a), proceed to **Fresh Init** (Step 2). If (b), skip Steps 2–10 and proceed to the **Update Mode** section at the bottom of this skill.

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

**Generate immediately:** Write `.claude/project-config/PROJECT.md` with the following content populated from the answers. In the skeleton below, `{not-configured stanza}` marks a section not yet collected — when writing the file, expand each `{not-configured stanza}` to the exact two-line marker defined in the **Not-Configured Marker** reference section near the end of this skill. The skeleton's 15 `##` headings are exactly the canonical **Required Section Headings** (listed near the end) — keep every heading exactly as written, in order. The first line of the file **must** be the version stamp.

```
<!-- pw-version: 1.5.0 -->
# {project_name} — Project Reference

> **Purpose:** This file provides the AI coding agent with the information needed to navigate, understand, and modify the project codebase. It is the central configuration that all action prompts reference at runtime via `PROJECT.md § Section Name` patterns.

---

## Overview

{architecture_overview — formatted as a readable description with ASCII diagram if provided}

---

## Source Control

| Setting | Value |
|---------|-------|
| Platform | `{platform}` |
| Instance | `{instance_url}` |
| Group / Organization | `{group}` |
| Group dashboard | `{group_dashboard}` |
| API base | `{api_base_url}` |
| Credential file | `.claude/project-config/.env` |

> See also: `## Container Registry` section below for registry URL and login command.

### Credential Loading

Load credentials from `.claude/project-config/.env`:

```
API_TOKEN_ENV_VAR=<personal access token>
REVIEW_TOKEN_ENV_VAR=<review bot token — used only by code review skill>
```

> **Review token:** The code review skill uses `REVIEW_TOKEN_ENV_VAR` instead of the general token. See the review skill's Environment Setup for loading instructions.

Once configured, see `project-workflows:{host}-api` skill for all API interaction patterns where `{host}` is the lowercase selected platform. **The `project-workflows` plugin ships with API reference skills for each supported host (gitlab-api, github-api, gitea-api).** Do not edit these skills; they document standardized operation names used by the action skills.

---

## Repository Locations

{not-configured stanza}

---

## Repository Dependency Order

{not-configured stanza}

---

## Container Registry

{not-configured stanza}

---

## Tech Stacks Per Repo

{not-configured stanza}

---

## Cross-Cutting Concerns

{not-configured stanza}

---

## Domain Concepts

{not-configured stanza}

---

## Work Item Conventions

{not-configured stanza}

---

## API Endpoints

{not-configured stanza}

---

## Database Schema

{not-configured stanza}

---

## Concurrent Session Isolation

{not-configured stanza}

---

## Local Development

{not-configured stanza}

---

## Design Documentation

{not-configured stanza}

---

## Git Tags

{not-configured stanza}
```

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

**Generate:** Update PROJECT.md by replacing the `## Repository Locations`, `## Repository Dependency Order`, and `## Tech Stacks Per Repo` sections using the `Edit` tool with the following structure:

**Repository Locations:**
```
## Repository Locations

| Repo Name | Local Path | Role / Description | Primary Tech Stack |
|-----------|------------|--------------------|--------------------|
| {repo_1} | {path_1} | {role_1} | {stack_1} |
...
```

**Repository Dependency Order:** (only if 2+ repos)
```
## Repository Dependency Order

| Build Order | Repo | Role in Dependency Chain | Notes |
|-------------|------|--------------------------|-------|
| 1 | {most_upstream_repo} | {role} | |
...
```
If single repo, write: "Single repository — no dependency ordering needed."

**Tech Stacks Per Repo:** One subsection per repo:
```
## Tech Stacks Per Repo

### `{repo_name}`

**Purpose:** {brief description}

| Property | Value |
|----------|-------|
| Language | {language} |
| Language version | {version or "not specified"} |
| Framework | {framework} |
| Key libraries | {comma-separated} |
| Test framework | {test_framework} |
| Build tool | {build_tool} |

#### Key Paths

```
{key paths, one per line}
```

#### Commands

| Action | Command |
|--------|---------|
| Lint | {lint_cmd} |
| Test | {test_cmd} |
| Build | {build_cmd} |
| Run | {run_cmd} |

#### CI Stages

```
{stage_1} → {stage_2} → ...
```
```

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

**Container Registry section:** If a registry was provided:
```
## Container Registry

| Setting | Value |
|---------|-------|
| Registry URL | `{registry_url}` |

### Image Naming Convention

```
{registry_url}/{group}/{repo_name}:{tag}
```

### Registry Login

```bash
docker login {registry_url} -u {username} -p $API_TOKEN_ENV_VAR
```
```
If none, write: "## Container Registry\n\nNo container registry configured."

**Local Development section:** If a deploy repo was provided:
```
## Local Development

### Starting Infrastructure

```bash
cd {worktrees_base}/{deploy_repo}
cp .env.example .env      # fill in secrets
{infrastructure_start_command}
```

### Running Services Individually

```bash
{one block per repo from Phase 4, using the run command they provided}
```
```
If no deploy repo, note that there is no Docker Compose stack configured.

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

Generate:
```
## Domain Concepts

### Terminology

| Term | Definition | Where Used |
|------|------------|------------|
{rows from user input}

### Domain Signals to Repo Mapping

| Domain Signals | Repo |
|----------------|------|
{rows from user input}

### PRD Files

{if prd_directory was provided:
Root: `{prd_directory}`

Read all Markdown files in this directory as PRD inputs. See `PRD-MANIFEST.md` (or the more general `SPEC-MANIFEST.md`) for extraction rules, test ID prefixes, and feature priorities. The `testing-spec` skill (or the legacy `testing-prd`) uses these to generate integration tests from your specs.
}
{if prd_directory was 'none' or skipped: {not-configured stanza} }
```

**Work Item Conventions** — Ask:
> "For Work Item Conventions (all host-agnostic; skip any that don't apply):
> - **Hierarchy & typing:** what are your work-item levels (e.g. epic → story → task), how is item type expressed (e.g. `type::` scoped labels), how are parent/child links formed, and what orthogonal label axes (priority, component, status) do you use?
> - **Lifecycle & status:** what status values does a work item move through, how is the next item to work on selected, and what are the advance/close transitions?
> - **Comment & body conventions:** what should a well-formed item body contain, and what are your comment conventions (prefixes, status-update format, links to commits/branches/change requests)?"

Generate:
```
## Work Item Conventions

### Hierarchy & Typing

{levels, type labels, parent/child links, and orthogonal label axes from user input — or "Not applicable."}

### Lifecycle & Status

{status values, selection rule, and advance/close transitions from user input — or "Not applicable."}

### Comment & Body Conventions

{body structure, comment conventions, and cross-reference conventions from user input — or "Not applicable."}
```

**API Endpoints** — Ask:
> "List your primary API endpoints: method, path, description, auth required (yes/no), which service handles it."

Generate:
```
## API Endpoints

| Method | Path | Description | Auth Required | Service |
|--------|------|-------------|---------------|---------|
{rows from user input}
```

**Database Schema** — Ask:
> "List your database tables: table name, purpose, key columns. Add a note if you have multiple databases."

Generate:
```
## Database Schema

| Table | Description | Key Columns |
|-------|-------------|-------------|
{rows from user input}
```

**Cross-Cutting Concerns** — Ask:
> "Describe your cross-cutting architectural patterns:
> - Auth flow (how users authenticate, token storage, token refresh, auth failure handling)
> - Message queue / event streaming (if applicable: consumer strategy, retry policy, queue names)
> - Caching strategy (if applicable: what is cached, invalidation)
> - Shared data models (data structures shared across services)"

Generate:
```
## Cross-Cutting Concerns

### Authentication Flow

{description from user}

### Message Queue / Event Streaming Patterns

{description from user, or "Not applicable."}

### Caching Strategy

{description from user, or "Not applicable."}

### Shared Data Models

{description from user, or "Not applicable."}
```

**Design Documentation** — Ask:
> "Where are your architecture docs, diagrams, and implementation plans stored? Provide paths (relative to worktrees base or absolute)."
> "Which documentation profile should this project use — `lite` (PRD only), `standard` (PRD + SDD; the default), or `full` (adds TSD + a project BRD)? See the taxonomy in `shared/documentation-taxonomy.md`."
> "What is your docs root (default `docs/`), and where do specs live (PRD directory, `.feature` globs, issue references) for `testing-spec`?"

Generate (the profile, docs root, and spec sources are `###` subsections — do **not** add a new `##` heading):
```
## Design Documentation

| Document | Path |
|----------|------|
{rows from user input}

### Documentation Profile

`{lite | standard | full}` — default `standard`. Sets which documents this project maintains (see `shared/documentation-taxonomy.md`).

### Docs Root

`{docs_root, default docs/}`

### Spec Sources

{PRD directory, `.feature` globs, and/or issue references used by `testing-spec` — or "not configured"}
```

**Git Tags** — Ask:
> "What are the current version tags for each repo, and what versioning scheme do you use (semver, calendar, etc.)?"

Generate:
```
## Git Tags

| Repo | Current Tag | Versioning Scheme |
|------|-------------|-------------------|
{rows from user input}
```

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

**Gitignore update:** Apply the **Gitignore Rule** (see File Generation Rules) to ensure `.gitignore` contains `.state-tracking/`.

**State directory:** Run `mkdir -p <PRIMARY_REPO_LOCAL_PATH>/.state-tracking/` to create the directory up-front so it exists before any skill writes state.

**Docs tree:** Scaffold the documentation subtree under the docs root captured in the Design Documentation step (default `docs/`). Create the spec/PRD subdirectory (e.g. `docs/prd/`) and, if the profile is `standard` or `full`, a design subdirectory (e.g. `docs/design/`) with `mkdir -p`. **Never clobber existing `docs/` content** — any current `docs/contributing`, `docs/troubleshooting`, or other files must be left untouched; only add missing directories. Do not create documents here — the `documentation` skill authors those on demand.

Append verbatim:

```
## Project Workflows Configuration

Config directory: `.claude/project-config/`

### Config Files

- **PROJECT.md** — Central project reference: architecture, repos, tech stacks, source control settings, and worktree conventions. Fill this in first — all other files and skills reference it.
- **STANDARDS.md** — Shared, severity-graded engineering standards (Universal Principles + per-repo) used by `code-review` (as severity floors) and applied by `issue-creation` and `development`.
- **TEST-MATRIX.md** — Integration test matrix: startup sequence, infrastructure checks, service health checks, and browser tests used by the `testing-static`, `testing-spec`, and `testing-prd` skills.
- **SPEC-MANIFEST.md** — Spec discovery and extraction rules (PRDs, issues, Gherkin `.feature` files), test ID prefixes, and feature priorities used by the `testing-spec` skill.
- **PRD-MANIFEST.md** — Legacy PRD discovery rules, test ID prefixes, and feature priorities used by the `testing-prd` skill (superseded by SPEC-MANIFEST.md).
- **.env.example** — Template for environment variables. Copy to `.env` and fill in values before using operational skills.

### Available Skills

| Skill | Invocation |
|-------|------------|
| Init (onboarding & updates) | `project-workflows:init` |
| Code Review | `project-workflows:code-review` |
| Development | `project-workflows:development` |
| Issue Creation | `project-workflows:issue-creation` |
| Static Testing | `project-workflows:testing-static` |
| Spec-driven Testing | `project-workflows:testing-spec` |
| PRD-driven Testing | `project-workflows:testing-prd` |
| GitHub API reference | `project-workflows:github-api` |
| GitLab API reference | `project-workflows:gitlab-api` |
| Gitea API reference | `project-workflows:gitea-api` |

> **Note:** Fill in `PROJECT.md` first — it is the hub all other files and skills reference.

State directory (auto-created, gitignored): `.state-tracking/` — runtime state for `development` and `code-review` skills.
```

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

---

---

## Update Mode

*This section is entered when Step 1 detects existing config files with `<!-- pw-version:` stamps, or when the user chose "Keep them" for legacy config files. Do NOT enter Update Mode during a Fresh Init — Fresh Init uses Steps 2–10 above.*

### U1: Status Dashboard

Read all 5 config files (if they exist). For each, report:
- **Version stamp** — the `pw-version` value, or "none (legacy file)"
- **Configured sections** — count of sections that do NOT have `<!-- not-configured -->` stubs
- **Unconfigured sections** — list of sections that still have `<!-- not-configured -->` stubs
- **Remaining placeholders** — note any `<!-- REPLACE THIS -->` markers still present
- **pw-status** — if `<!-- pw-status: not-configured -->` is present, note the file was scaffolded but not configured

Example output format:
```
### Configuration Status

| File | Version | Status | Notes |
|------|---------|--------|-------|
| PROJECT.md | 1.5.0 | 10/15 sections configured | Unconfigured: Work Item Conventions, API Endpoints, DB Schema, Cross-Cutting, Git Tags |
| STANDARDS.md | 1.5.0 | Scaffolded | Per-repo standards not yet filled in |
| TEST-MATRIX.md | 1.5.0 | Partial | 3 REPLACE THIS markers remain |
| PRD-MANIFEST.md | — | Not created | |
| .env | — | Present | API_TOKEN_ENV_VAR set |
```

### U2: Action Menu

Ask the user what they want to do (use `AskUserQuestion`):

> "What would you like to update?"
>
> Options:
> - **Add a new repository** — add a repo to PROJECT.md and all secondary config files
> - **Fill in a PROJECT.md section** — re-interview a specific section
> - **Configure a skill** — generate or reconfigure STANDARDS.md, TEST-MATRIX.md, SPEC-MANIFEST.md, or PRD-MANIFEST.md
> - **Update repository details** — edit an existing repo's tech stack, commands, or paths
> - **Refresh all** — re-interview everything (existing answers are shown as defaults)
> - **Something else** — describe what you want to change

Handle each option:

**Add a new repository:**
- Run the Phase 4 interview loop for just the new repo (name, path, role, stack, commands, paths, CI stages).
- Append a new row to the `## Repository Locations` table.
- Append a new `### {repo_name}` block under `## Tech Stacks Per Repo`.
- If a `## Repository Dependency Order` section exists and is populated, ask where the new repo fits in the order and update the table.
- If STANDARDS.md exists with `<!-- pw-version:`, append a new empty `## {repo_name}` section under `## Per-Repository Standards`.
- If TEST-MATRIX.md exists with `<!-- pw-version:`, note to the user: "TEST-MATRIX.md was not automatically updated — if this repo has a service with health endpoints, add a `## Service Health Checks` block for it manually or run `/project-workflows:init` → 'Configure a skill' → testing-static/testing-prd."
- Confirm what was updated.

**Fill in a PROJECT.md section:**
- Ask: "Which section?" (present the list of unconfigured sections from the status dashboard).
- Run the relevant interview sub-flow from Steps 4–6 for that section.
- Use `Edit` tool to replace the `<!-- not-configured -->` stub with populated content.

**Configure a skill:**
- Ask which skill (code-review / testing-static / testing-spec / testing-prd).
- Run the relevant interview sub-flow from Step 7.
- If the config file already exists with `<!-- pw-status: not-configured -->`, overwrite it entirely with the newly generated content (do not attempt to merge with the stub).
- If the config file already exists with populated content, use `Edit` tool to surgically update sections.

**Update repository details:**
- Ask: "Which repository, and what do you want to change?"
- Make surgical edits to the relevant `### {repo_name}` block in `## Tech Stacks Per Repo`, or the row in `## Repository Locations`, using `Edit` tool.

**Refresh all:**
- For each PROJECT.md section, read the current content and present it as the default, then ask if the user wants to change it.
- This is a full re-interview where each answer is pre-populated with existing content.
- **Caveat:** The agent reads back its own previously generated markdown (tables, prose) rather than a saved answer log. For structured sections like `## Tech Stacks Per Repo`, the agent will parse table rows back into answer form. This works for most content but may lose formatting nuance. Inform the user: "I'll use your current config as defaults — let me know if anything looks off."

**Something else:**
- Ask the user to describe the change. Make the edit directly.

**Gitignore check (always run in update mode):** After completing any update action, apply the **Gitignore Rule** (see File Generation Rules).

### U3: Version Mismatch

> **`pw-version` is the config-structure version, not the plugin release version.** They are deliberately decoupled: `pw-version` changes only when the config-file structure changes, whereas the plugin's release version (`plugin.json`) advances on every release. Never reconcile one to the other.

The current config-structure version is `1.5.0`. If any file's `<!-- pw-version:` stamp reads `1.0.0`, `1.0.1`, `1.2.0`, `1.3.0`, or `1.4.0`, offer to migrate it (match version strings explicitly — e.g. `reads 1.3.0` — rather than by numeric comparison, to avoid ambiguity with strings like `1.10.0`):

> "Some config files use an older structure (`{stamp}`). I can migrate them to the current structure (`1.5.0`) while preserving your content. Changes up to 1.3.0: `§ Infrastructure` → `§ Local Development` in TEST-MATRIX.md and `testing-2.md` → `testing-prd` in PRD-MANIFEST.md (from 1.0.0); and, for 1.3.0, `PROJECT.md § Design Documentation` gains `### Documentation Profile`, `### Docs Root`, and `### Spec Sources` subsections, plus a new `SPEC-MANIFEST.md` for `testing-spec`. For 1.4.0, `REVIEW-CRITERIA.md` is renamed to `STANDARDS.md` on the normalized `Category | What to check | Severity` schema (`## Universal` → `## Universal Principles`; per-repo sections gain a `Severity` column). For 1.5.0, `PROJECT.md` gains a new `## Work Item Conventions` section (after `## Domain Concepts`, with `### Hierarchy & Typing`, `### Lifecycle & Status`, and `### Comment & Body Conventions` subsections) consumed by the `work-item` skill. Would you like to migrate now?"

If yes: read the existing content, extract user-populated values by section, regenerate each file with the current structure, and update the version stamp to `1.5.0`. The Design Documentation subsections (1.3.0) add no `##` heading, but the 1.4.0→1.5.0 step **does** add one — insert `## Work Item Conventions` into `PROJECT.md` after `## Domain Concepts` (as a `<!-- not-configured -->` stub, or offer its Step 6 interview) so the file matches the 15-heading required list. For the `REVIEW-CRITERIA.md` → `STANDARDS.md` rename specifics, see the dedicated migration block below.

**Legacy `REVIEW-CRITERIA.md` → `STANDARDS.md` (1.4.0 rename):** if a `REVIEW-CRITERIA.md` is present, migrate it as part of the confirmed migration above — without this, `code-review` (which now reads `STANDARDS.md`) would find no standards file and fall back to its built-in framework, silently dropping the project's existing criteria:

- Write `.claude/project-config/STANDARDS.md` by reading the template at `skills/init/templates/STANDARDS.md` (single source), keeping its `<!-- pw-version: 1.5.0 -->` first line.
- Carry the user's content across: map the old `## Universal` rows into `## Universal Principles` on the `Category | What to check | Severity` schema, and copy each `## {repo_name}` section, adding a `Severity` column. Assign each migrated row a `Severity` floor — default the standard categories to the seed floors (Security `critical`; Generated files / Error handling / Tests / Dependencies / SOLID `warning`; Naming / Debug artifacts `suggestion`) and ask the user to pick a floor for any custom rows (default `warning`).
- Fix the legacy `SOLID` "principals" typo and drop any inline `**critical**` / prose-encoded severity markers — those move into the `Severity` column.
- Delete the old `REVIEW-CRITERIA.md` once `STANDARDS.md` is written.

**Legacy `PRD-MANIFEST.md` → `SPEC-MANIFEST.md` (user-confirmed, never automatic):** if a `PRD-MANIFEST.md` is present and no `SPEC-MANIFEST.md` exists, prompt:

> "You have a legacy `PRD-MANIFEST.md`. `testing-spec` reads the more general `SPEC-MANIFEST.md` (spec sources include `.feature` files and issues) and falls back to `PRD-MANIFEST.md` when it is absent — so no action is required. Would you like me to generate a `SPEC-MANIFEST.md` from your `PRD-MANIFEST.md` now? I will keep `PRD-MANIFEST.md` in place."

Only migrate on explicit confirmation. Generate `SPEC-MANIFEST.md` from `skills/init/templates/SPEC-MANIFEST.md`, carrying over the PRD directory (as a Spec Source), Test ID Prefixes, Feature Priorities, and Deduplication Rules. Never delete or mutate `PRD-MANIFEST.md`.

> **Maintenance note:** When the config structure changes in future, update this section with the new version, the previous versions that require migration, and the structural delta. Use explicit version string matching.

---

## File Generation Rules (Reference)

These rules apply to all generated files:

### Required Section Headings

The following headings in `PROJECT.md` are read by other skills and **must appear exactly as written** (including capitalization and spacing):

- `## Overview`
- `## Source Control`
- `## Repository Locations`
- `## Repository Dependency Order`
- `## Container Registry`
- `## Tech Stacks Per Repo`
- `## Cross-Cutting Concerns`
- `## Domain Concepts`
- `## Work Item Conventions`
- `## API Endpoints`
- `## Database Schema`
- `## Concurrent Session Isolation`
- `## Local Development`
- `## Design Documentation`
- `## Git Tags`

`STANDARDS.md` must have `## Universal Principles` and one `## {repo_name}` section per repo.

`PRD-MANIFEST.md` must have `## PRD Directory`, `## Extraction Rules`, `## Test ID Prefixes`, `## Feature Priorities`, `## Deduplication Rules`.

`SPEC-MANIFEST.md` must have `## Spec Sources`, `## Extraction Rules`, `## Test ID Prefixes`, `## Feature Priorities`, `## Deduplication Rules`.

> The documentation profile, docs root, and spec sources are `###` **subsections** under the existing `## Design Documentation` heading — they add no new `##` heading, so the required-headings list above is unchanged.

### Version Stamp Format

Always place `<!-- pw-version: 1.5.0 -->` as the **first line** of every generated config file. This enables update mode detection and template version tracking.

### Not-Configured Marker

For skipped sections — and wherever the skeletons above write `{not-configured stanza}` — use exactly these two lines:
```
<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.
```

This marker is detected by Update Mode to identify unconfigured sections.

### Gitignore Rule

Ensure the project-root `.gitignore` contains `.state-tracking/` so runtime state files are never accidentally committed: if `.gitignore` exists but lacks the line, append it; if it does not exist, create it with this single line. Do NOT remove or modify any other pre-existing lines. This is idempotent and safe to run repeatedly.

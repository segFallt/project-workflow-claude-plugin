<!-- pw-version: 1.1.0 -->
# <PROJECT_NAME> — Project Reference

> **Purpose:** This file provides the AI coding agent with the information needed to navigate, understand, and modify the project codebase. It is the central configuration that all action prompts reference at runtime via `PROJECT.md § Section Name` patterns. Fill in every section before using the action prompts.

---

## Overview

> [FILL IN] Replace this section with your system architecture overview. Include a text/ASCII diagram showing major components, how they communicate (REST, gRPC, message queues, etc.), and which repositories own which components.

```
<COMPONENT_1> (repo-name-1)
      |  <PROTOCOL>
      v
<COMPONENT_2> (repo-name-2)
      |
      +-- <DEPENDENCY_A>
      +-- <DEPENDENCY_B>
      +-- <DEPENDENCY_C>
```

---

## Source Control

> [FILL IN] Configure your repository hosting platform, credentials, and API access. All action prompts read this section for API interaction patterns.

| Setting | Value |
|---------|-------|
| Platform | `<REPO_HOST>` |
| Instance | `<INSTANCE_URL>` |
| Group / Organization | `<GROUP>` |
| Group dashboard | `<INSTANCE_URL>/groups/<GROUP>` |
| API base | `<API_BASE_URL>` |

### Credential Loading

Load credentials from `<ENV_FILE_PATH>`:

```
<API_TOKEN_ENV_VAR>=<personal access token>
<REVIEW_TOKEN_ENV_VAR>=<review bot token — used only by code review prompts>
```

> **Review token:** The code review prompt uses `<REVIEW_TOKEN_ENV_VAR>` instead of the general token. See the review prompt's Environment Setup for its loading instructions.

Once configured, see `project-workflows:<host>-api` skill for all API interaction patterns where `<host>` is the lowercase selected `<REPO_HOST>`. **The `project-workflows` plugin ships with API reference skills for each supported host (gitlab-api, github-api, gitea-api).** Do not edit these skills; they document standardized operation names used by the action prompts.

---

## Repository Locations

> [FILL IN] List every repository in the project with its local path, role, and primary tech stack.

| Repo Name | Local Path | Role / Description | Primary Tech Stack |
|-----------|------------|--------------------|--------------------|
| | | | |
| | | | |
| | | | |

---

## Repository Dependency Order

> [FILL IN] When a change touches multiple repos, implement and merge in this order. List repos from most upstream (fewest dependencies) to most downstream.

| Build Order | Repo | Role in Dependency Chain | Notes |
|-------------|------|--------------------------|-------|
| | | | |
| | | | |
| | | | |

---

## Container Registry

> [FILL IN] Configure your container registry URL, image naming convention, and login command.

| Setting | Value |
|---------|-------|
| Registry URL | `<REGISTRY_URL>` |

### Image Naming Convention

```
<REGISTRY_URL>/<GROUP>/<REPO_NAME>:<TAG>
```

### Registry Login

```bash
docker login <REGISTRY_URL> -u <username> -p $<API_TOKEN_ENV_VAR>
```

---

## Tech Stacks Per Repo

> [FILL IN] Document the tech stack for each repository. Repeat the block below for each repo in your project.

### `<REPO_NAME>`

**Purpose:** _Brief description of what this repo does._

| Property | Value |
|----------|-------|
| Language | |
| Language version | |
| Framework | |
| Key libraries | |
| Test framework | |
| Build tool | |

#### Key Paths

```
<list key files and directories here>
```

#### Commands

| Action | Command |
|--------|---------|
| Lint | |
| Test | |
| Build | |
| Run | |

#### CI Stages

```
<stage-1> -> <stage-2> -> <stage-3> -> <stage-4>
```

> **Note:** Repeat this block for each repository.

---

## Cross-Cutting Concerns

> [FILL IN] Document architectural patterns shared across repos here. Common examples are listed below as a starting framework — remove, add, or modify sections as appropriate for your project.

### Authentication Flow

1. _Describe how users authenticate (e.g., JWT, OAuth, API key)_
2. _Describe token storage and injection_
3. _Describe token refresh / expiry handling_
4. _Describe how auth failures are handled_

### Message Queue / Event Streaming Patterns

_If your system uses message queues (Redis Streams, RabbitMQ, Kafka, etc.), describe:_

- Consumer strategy (at-least-once, exactly-once, etc.)
- Retry and dead-letter-queue (DLQ) policy
- Consumer group naming conventions
- Stream/topic/queue names

### Caching Strategy

_Describe any caching layers (Redis, in-memory, CDN) and invalidation patterns._

### Shared Data Models

_List data structures or contracts shared across services (e.g., protobuf definitions, shared TypeScript types, JSON schemas)._

---

## Domain Concepts

> [FILL IN] Define domain terminology, map domain signals to repositories, and point to PRD files.

### Terminology

| Term | Definition | Where Used |
|------|------------|------------|
| | | |
| | | |
| | | |

### Domain Signals to Repo Mapping

_Use these signals to route issues and changes to the correct repository:_

| Domain Signals | Repo |
|----------------|------|
| | |
| | |
| | |

### PRD Files

Root: `<PRD_DIRECTORY>`

Read all Markdown files in this directory as PRD inputs. See `PRD-MANIFEST.md` for extraction rules, test ID prefixes, and feature priorities — this file ships with the template as a skeleton that you fill in with your project's PRD categories. The `testing-prd` skill uses it to dynamically generate integration tests from your PRDs.

---

## API Endpoints

> [FILL IN] List the primary API endpoints exposed by your services.

| Method | Path | Description | Auth Required | Service |
|--------|------|-------------|---------------|---------|
| | | | | |
| | | | | |
| | | | | |

---

## Database Schema

> [FILL IN] List the database tables and their purposes. Add a separate table section per database if you have more than one.

| Table | Description | Key Columns |
|-------|-------------|-------------|
| | | |
| | | |
| | | |

---

## Concurrent Session Isolation

> [FILL IN] This section defines the git worktree strategy for running multiple AI coding agent sessions in parallel. The paths below use `<WORKTREES_BASE>` — update it to match your project root. The worktree logic itself is ready to use.

Multiple agent sessions can run simultaneously against the same project. Since all prompts reference repos at `<WORKTREES_BASE>/<REPO_NAME>/`, concurrent sessions collide on branch checkouts, staged files, and working directory state. Git worktrees solve this: each worktree is a separate working directory on its own branch, sharing the same `.git` object store.

### Why worktrees

- Prevents concurrent sessions from clobbering each other's branch state, staging area, and working files
- Each session stays isolated; no session needs to know what other sessions are doing
- Shared `.git` object store means no duplication of history or objects

> **Convention note:** In this section, `<ANGLE_BRACKET>` tokens are project-specific values you fill in at setup time (defined in the Appendix). `{curly_brace}` variables are per-session runtime values substituted each time you start a new session.

### Directory convention

```
<WORKTREES_BASE>/.worktrees/{branch_name}/<REPO_NAME>/
```

Repos remain **siblings** under `{branch_name}/` so that relative paths between repos (e.g., `../<REPO_NAME>` references in build configs) keep working without any changes.

### Creating a worktree

```bash
cd <WORKTREES_BASE>/<REPO_NAME>
git fetch origin
git worktree add \
  <WORKTREES_BASE>/.worktrees/{branch_name}/<REPO_NAME> \
  -b {branch_name} origin/main
```

### Preserving relative paths

Some repos reference siblings via relative paths (e.g., `replace example.com/org/repo-a => ../repo-a` in a Go module, or symlinks like `repo-b/repo-a -> ../repo-a`). When creating a worktree for one repo, symlink the repos you are **not** modifying so the sibling structure is intact:

```bash
# Example: worktree for <REPO_NAME> only — symlink a sibling repo
ln -s <WORKTREES_BASE>/<SIBLING_REPO> \
  <WORKTREES_BASE>/.worktrees/{branch_name}/<SIBLING_REPO>
```

If **multiple** repos need changes on the same branch, create worktrees for all of them under the same `{branch_name}` directory — they will then be natural siblings:

```bash
git -C <WORKTREES_BASE>/<REPO_A> worktree add \
  <WORKTREES_BASE>/.worktrees/{branch_name}/<REPO_A> \
  -b {branch_name} origin/main

git -C <WORKTREES_BASE>/<REPO_B> worktree add \
  <WORKTREES_BASE>/.worktrees/{branch_name}/<REPO_B> \
  -b {branch_name} origin/main
```

### Working in the worktree

All file edits, builds, tests, and git commands (`git add`, `git commit`, `git push`) must use the worktree path, **not** the main clone:

```bash
cd <WORKTREES_BASE>/.worktrees/{branch_name}/<REPO_NAME>
# edit, build, test, commit here
git push -u origin {branch_name}
```

### Sub-agents

Pass the worktree path as the repo path when delegating to sub-agents. The instruction "do not create or switch branches" remains valid — the branch is already set up in the worktree.

### Cleanup after merge request / pull request

```bash
# From the main clone
git -C <WORKTREES_BASE>/<REPO_NAME> worktree remove \
  <WORKTREES_BASE>/.worktrees/{branch_name}/<REPO_NAME>
```

To prune stale worktree metadata (e.g., after a remote branch was deleted):

```bash
git -C <WORKTREES_BASE>/<REPO_NAME> worktree prune
```

### Caveats

- **Docker Compose ports/containers are shared** — only one testing session should run infrastructure at a time, or use different port mappings
- **`.env` files** outside repos are shared and should be treated as read-only by all sessions
- **Two sessions must not work on the same issue simultaneously** — coordinate with the user before starting

---

## Local Development

> [FILL IN] Document the startup order and per-service run commands for local development.

### Starting Infrastructure

```bash
cd <WORKTREES_BASE>/<DEPLOY_REPO>
cp .env.example .env      # fill in secrets
# <INFRASTRUCTURE_START_COMMAND>
```

### Running Services Individually

```bash
# Service 1
cd <WORKTREES_BASE>/<SERVICE_1_REPO>
# <SERVICE_1_RUN_COMMAND>

# Service 2
cd <WORKTREES_BASE>/<SERVICE_2_REPO>
# <SERVICE_2_RUN_COMMAND>

# Service 3
cd <WORKTREES_BASE>/<SERVICE_3_REPO>
# <SERVICE_3_RUN_COMMAND>
```

---

## Design Documentation

> [FILL IN] Point to architecture docs, PRDs, diagrams, and design plans.

| Document | Path |
|----------|------|
| System overview | `<WORKTREES_BASE>/<DOCS_REPO>/` |
| Architecture docs | `<WORKTREES_BASE>/<DOCS_REPO>/docs/architecture/` |
| PRD directory | `<PRD_DIRECTORY>` |
| Diagrams | `<WORKTREES_BASE>/<DOCS_REPO>/docs/architecture/diagrams/` |
| Implementation plans | |

---

## Git Tags

> [FILL IN] Track the current version tags for each repository.

| Repo | Current Tag | Versioning Scheme |
|------|-------------|-------------------|
| | | |
| | | |
| | | |

---

## Appendix: Placeholder Reference

> Summary of all `<PLACEHOLDER>` tokens defined in this file. Fill in every placeholder before using the action prompts.

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `<PROJECT_NAME>` | Human-readable project name | My Platform |
| `<INSTANCE_URL>` | Repository host instance URL | `https://gitlab.company.com` or `https://github.com` |
| `<GROUP>` | Group or organization name | `my-org` |
| `<API_BASE_URL>` | API base URL for the repo host | `https://gitlab.company.com/api/v4` or `https://api.github.com` |
| `<REPO_HOST>` | Repository hosting platform | `GitLab` \| `GitHub` \| `Gitea` |
| `<API_TOKEN_ENV_VAR>` | Env var name holding the general API token | `MY_PROJECT_GITLAB_TOKEN` |
| `<REVIEW_TOKEN_ENV_VAR>` | Env var name holding the review bot token | `MY_PROJECT_REVIEW_TOKEN` |
| `<ENV_FILE_PATH>` | Path to `.env` file | `.claude/project-config/.env` |
| `<WORKTREES_BASE>` | Base directory for git worktrees and repo clones | `/workspace/my-project` |
| `<PRD_DIRECTORY>` | Path to PRD files | `/workspace/my-project/docs/product/` |
| `<REGISTRY_URL>` | Container registry URL | `registry.gitlab.com` |
| `<REPO_NAME>` | Name of a repository (used in templates) | `my-service` |
| `<DOCS_REPO>` | Name of the documentation repository | `my-docs` |
| `<DEPLOY_REPO>` | Name of the deployment/infrastructure repository | `my-deploy` |
| `<COMPONENT_1>`, `<COMPONENT_2>` | Architecture diagram component names | `API Gateway`, `Backend Service` |
| `<PROTOCOL>` | Communication protocol between components | `REST`, `gRPC`, `WebSocket` |
| `<SIBLING_REPO>` | A repo referenced as a sibling via relative paths | `shared-lib` |
| `<REPO_A>`, `<REPO_B>` | Repo names used in multi-repo worktree examples | `service-a`, `service-b` |
| `<SERVICE_N_REPO>`, `<SERVICE_N_RUN_COMMAND>` | Repo name and run command for each service (N = 1, 2, 3, …) | `my-api`, `go run ./cmd/server` |

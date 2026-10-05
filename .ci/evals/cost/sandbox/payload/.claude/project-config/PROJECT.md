<!-- pw-version: 1.5.0 -->
# agent-sandbox — Project Reference

> **Purpose:** This file provides the AI coding agent with the information needed to navigate, understand, and modify the project codebase. It is the central configuration that all action prompts reference at runtime via `PROJECT.md § Section Name` patterns.

---

## Overview

`agent-sandbox` is a throwaway, single-repository project used only to measure the token and cost profile of the project-workflows plugin skills (#68). It contains a tiny POSIX sh calculator (`src/calc.sh`), its tests (`test.sh`), and a one-job GitLab CI pipeline. Issues and merge requests here are disposable; do not use this project for real work.

---

## Source Control

| Setting | Value |
|---------|-------|
| Platform | `GitLab` |
| Instance | `https://gitlab.n3.pingleberry.com` |
| Group / Organization | `code-agent-workspace` |
| Group dashboard | `https://gitlab.n3.pingleberry.com/code-agent-workspace` |
| API base | `https://gitlab.n3.pingleberry.com/api/v4` |
| Credential file | `.claude/project-config/.env` |

> See also: `## Container Registry` section below for registry URL and login command.

### Credential Loading

Load credentials from `.claude/project-config/.env`:

```
API_TOKEN_ENV_VAR=<personal access token>
REVIEW_TOKEN_ENV_VAR=<review bot token — used only by code review skill>
```

> **Review token:** The code review skill uses `REVIEW_TOKEN_ENV_VAR` instead of the general token. See the review skill's Environment Setup for loading instructions.

Once configured, see `project-workflows:gitlab-api` skill for all API interaction patterns. **The `project-workflows` plugin ships with API reference skills for each supported host (gitlab-api, github-api, gitea-api).** Do not edit these skills; they document standardized operation names used by the action skills.

---

## Repository Locations

| Repo Name | Local Path | Role / Description | Primary Tech Stack |
|-----------|------------|--------------------|--------------------|
| agent-sandbox | /home/vscode/cost-eval/agent-sandbox | throwaway cost-eval sandbox | POSIX sh |

---

## Repository Dependency Order

Single repository — no cross-repo build order.

---

## Container Registry

<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.

---

## Tech Stacks Per Repo

### `agent-sandbox`

**Purpose:** Tiny POSIX sh calculator used as a disposable target for cost-eval runs.

| Property | Value |
|----------|-------|
| Language | POSIX sh |
| Language version | not specified |
| Framework | none |
| Key libraries | none |
| Test framework | plain sh (`test.sh`) |
| Build tool | none |

#### Key Paths

```
src/calc.sh
test.sh
.gitlab-ci.yml
```

#### Commands

| Action | Command |
|--------|---------|
| Lint | `sh -n src/calc.sh` |
| Test | `sh test.sh` |
| Build | not applicable |
| Run | `sh src/calc.sh add 1 2` |

#### CI Stages

```
test
```

---

## Cross-Cutting Concerns

<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.

---

## Domain Concepts

### Terminology

| Term | Definition | Where Used |
|------|------------|------------|
| calc command | A subcommand of `src/calc.sh` (e.g. `add`) | src/calc.sh, test.sh |

### Domain Signals to Repo Mapping

| Domain Signals | Repo |
|----------------|------|
| calc, sandbox | agent-sandbox |

### PRD Files

<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.

---

## Work Item Conventions

### Hierarchy & Typing

Flat issues, no parent/child hierarchy. Each issue carries exactly one type label: `type::feature`, `type::bug`, or `type::task`. Optional priority label: `priority::high`, `priority::medium`, or `priority::low`. No milestones.

### Lifecycle & Status

New issues are created with `status::new`. Refinement sets `status::ready` once the issue meets the ready bar (clear scope, Gherkin acceptance criteria, Definition of Done). Development moves an issue to `status::in-progress`; merging the MR closes it.

### Comment & Body Conventions

Issue bodies use the sections Feature (or Bug), Acceptance Criteria (Gherkin), and Definition of Done. Reference issues as `#<iid>` and merge requests as `!<iid>`.

---

## API Endpoints

<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.

---

## Database Schema

<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.

---

## Concurrent Session Isolation

Each agent session works in its own git worktree so concurrent sessions never share a checkout.

### Directory convention

```
/home/vscode/cost-eval/.worktrees/<branch-slug>/agent-sandbox
```

### Creating a worktree

```bash
cd /home/vscode/cost-eval/agent-sandbox
git fetch origin
git worktree add /home/vscode/cost-eval/.worktrees/<branch-slug>/agent-sandbox -b <branch-name> origin/main
```

### Removing a worktree

```bash
git -C /home/vscode/cost-eval/agent-sandbox worktree remove /home/vscode/cost-eval/.worktrees/<branch-slug>/agent-sandbox
```

---

## Local Development

<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.

---

## Design Documentation

<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.

---

## Git Tags

<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.

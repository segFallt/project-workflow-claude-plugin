# project-workflows

Reusable workflow skills for code review, development, testing, and issue management across any project.

## Overview

`project-workflows` is a Claude Code plugin that provides 9 skills covering the full development lifecycle. Skills follow a coordinator + sub-agent pattern: a top-level skill orchestrates a task by delegating to specialised sub-agents for exploration, implementation, review, and API calls.

The plugin is project-agnostic — it reads project-specific configuration from files in `.claude/project-config/` (scaffolded by the `init` skill) rather than hard-coding any project details.

## Available Skills

| Skill | Description |
|-------|-------------|
| `init` | Set up a new project to use the plugin — scaffolds config files |
| `code-review` | Review all open change requests across configured repositories |
| `development` | Implement a feature, bug fix, or task from an issue |
| `issue-creation` | Create a well-structured issue from a problem description or feature request |
| `testing-prd` | Run integration tests generated dynamically from PRDs |
| `testing-static` | Run integration tests using a static test matrix |
| `gitlab-api` | Reference skill for GitLab REST API operations (MRs, issues, notes, branches) |
| `github-api` | Reference skill for GitHub REST API operations (PRs, issues, reviews, branches) |
| `gitea-api` | Reference skill for Gitea REST API operations (PRs, issues, comments, branches) |

## Prerequisites

- [Claude Code CLI](https://claude.ai/code) installed (`npm install -g @anthropic-ai/claude-code`)

## Installation

### Local install via marketplace

1. Clone or download this repository:
   ```bash
   git clone <repository-url>
   ```

2. Register the local marketplace:
   ```bash
   claude plugin marketplace add /path/to/project-workflow-claude-plugin
   ```

3. Install the plugin (project scope recommended):
   ```bash
   claude plugin install project-workflows@project-workflows-marketplace --scope project
   ```

4. Verify the installation:
   ```bash
   claude plugin list
   ```

## Getting Started

Run the `init` skill to scaffold configuration files for your project:

```
/project-workflows:init
```

This creates the following files in `.claude/project-config/`:

| File | Purpose |
|------|---------|
| `PROJECT.md` | Project overview, repositories, API credentials, team context |
| `REVIEW-CRITERIA.md` | Code review standards and acceptance criteria |
| `TEST-MATRIX.md` | Static test matrix for the `testing-static` skill |
| `PRD-MANIFEST.md` | Product requirements for the `testing-prd` skill |
| `.env.example` | Environment variable template for API tokens |

Populate these files with your project's details. All other skills read from them at runtime — no further configuration required.

## Usage

Once configured, invoke skills using the Claude Code slash command syntax:

```
/project-workflows:code-review
/project-workflows:development
/project-workflows:issue-creation
/project-workflows:testing-prd
/project-workflows:testing-static
```

The API reference skills (`gitlab-api`, `github-api`, `gitea-api`) are loaded automatically by other skills when needed and do not need to be invoked directly.

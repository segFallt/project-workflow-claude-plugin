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

1. Register the marketplace directly from the git repository:
   ```bash
   claude plugin marketplace add https://github.com/segFallt/project-workflow-claude-plugin
   ```

2. Install the plugin (project scope recommended):
   ```bash
   claude plugin install project-workflows@project-workflows-marketplace --scope project
   ```

3. Verify the installation:
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

## Versioning & Releases

This plugin uses [Semantic Versioning](https://semver.org/). Releases are tagged with `v<major>.<minor>.<patch>` (e.g., `v1.0.0`).

### Installing a specific version

The standard install uses the git repository URL directly and pulls the latest `main`:

```bash
claude plugin marketplace add https://github.com/segFallt/project-workflow-claude-plugin
```

To pin to a specific tagged release, clone at the desired tag and register using `$HOME` or a full `/absolute/path`:

```bash
git clone --branch v1.0.0 https://github.com/segFallt/project-workflow-claude-plugin
claude plugin marketplace add ./project-workflow-claude-plugin
```

> **Note:** The path passed to `marketplace add` must resolve to an absolute path starting with `/`. `$HOME` and `~` both work because the shell expands them before Claude sees the value — but a relative path (e.g. `./project-workflow-claude-plugin`) will cause a `Marketplace file not found` error. Do not move or delete the cloned directory after registration.

### Updating the plugin

**Tracking latest (installed from git URL):**

Claude Code pulls marketplace updates automatically at the start of each session. To force an immediate update, re-run the original `marketplace add` command — it will refresh the local clone:

```bash
claude plugin marketplace add https://github.com/segFallt/project-workflow-claude-plugin.git
```

If your version of Claude Code includes the `update` subcommand, you can also use it as a shorthand:

```bash
claude plugin update project-workflows
```

Note: the `update` subcommand may not be available in all versions of Claude Code — use the `marketplace add` approach above if it is not.

**Pinned to a specific version (installed from local clone):**

Fetch the new tags and check out the desired version, then the plugin is updated in-place (no reinstall needed):

```bash
git -C $HOME/project-workflow-claude-plugin fetch --tags
git -C $HOME/project-workflow-claude-plugin checkout v1.0.0
```

### Release history

All releases are listed on the [GitLab Releases page](https://github.com/segFallt/project-workflow-claude-plugin/releases). See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

### Creating a release (maintainers)

See [docs/contributing/releasing.md](docs/contributing/releasing.md) for the full release process.

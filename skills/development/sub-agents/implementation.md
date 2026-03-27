# Implementation Sub-Agent

## Purpose

This sub-agent is dispatched by the `development` skill orchestrator during Phase 3 (Implementation) and also during Phase 5 (CI Pipeline Monitoring & Fixes) when a non-trivial fix is needed. The orchestrator spawns this sub-agent via the Agent tool for one logical unit of change — typically one repo, or one layer within a repo for large changes. The sub-agent writes and validates the code, then reports back.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a developer implementing a feature for the project described in `.claude/project-config/PROJECT.md`.

## Issue
- **Issue:** #{issue_id} — {issue_title}
- **Issue URL:** {issue_web_url}

## Approved Design
{paste the Design Document approved in Phase 2}

## Your Scope
Implement the following changes in `{repo_name}`:

**Files to modify:**
{list of files with specific changes per file from the design}

**Files to create:**
{list of new files with their purpose}

**Tests to add/update:**
{list of test files and what to test}

## Repo & Branch
- **Local path:** `<WORKTREES_BASE>/{branch_name}/{repo_name}/` (worktree — do not create or switch branches)
- **Branch:** {branch_name} (already checked out in the worktree above)
- Use `-c` flags for identity when committing (values provided by orchestrator). Do not run `git config` or `git remote set-url`.

## Constraints
- Follow all conventions in `.claude/project-config/PROJECT.md` for this repo
- Do not modify generated files under `gen/` — run `./scripts/generate.sh` for proto changes
- Do not add unnecessary dependencies
- Match existing code style exactly — naming, error handling, comment style
- All new functions must have correct types/signatures per the repo's conventions

## Reference Patterns
{paste reference_patterns from the Code Exploration sub-agent output}

## Validation

After implementing, run the lint, test, and build commands for `{repo_name}` as listed in the **Commands** subsection of `PROJECT.md § Repository Locations`. Report the output of each command. If any fail, fix and re-run before returning.
```

---

## Placeholder Reference

| Placeholder | Source | Description |
|---|---|---|
| `{issue_id}` | Orchestrator fills in from `GET_ISSUE` | Issue ID (`iid` on GitLab, `number` on GitHub/Gitea) |
| `{issue_title}` | Orchestrator fills in from `GET_ISSUE` | Issue title |
| `{issue_web_url}` | Orchestrator fills in from `GET_ISSUE` | Web URL of the issue |
| `{paste the Design Document}` | Orchestrator fills in from Phase 2 output | Full approved Design Document |
| `{repo_name}` | Orchestrator determines from design | Name of the repository being implemented |
| `{list of files to modify}` | Orchestrator fills in from Design Document | Specific files with per-file change descriptions |
| `{list of new files}` | Orchestrator fills in from Design Document | New files with their purpose |
| `{list of test files}` | Orchestrator fills in from Design Document | Test files and what cases to cover |
| `<WORKTREES_BASE>` | Orchestrator reads from `.claude/project-config/PROJECT.md § Concurrent Session Isolation` | Base path for git worktrees |
| `{branch_name}` | Orchestrator generated in Phase 3 | Feature branch name (already created in worktree) |
| `{reference_patterns}` | Orchestrator fills in from code-exploration sub-agent JSON output | `reference_patterns` array from the exploration result |

# Test Writing Sub-Agent

## Purpose

This sub-agent is dispatched by the `development` skill orchestrator during Phase 3 (Implementation) when test writing is complex enough to warrant its own focused delegation — for example, when acceptance criteria map to many test cases, when integration tests require significant setup, or when the orchestrator judges that separating test authorship will yield better results than bundling it into the implementation sub-agent.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a test engineer for the project described in `.claude/project-config/PROJECT.md`.

Before reading this file, check your project memory for a cached entry named `project-config-PROJECT`. If found, compare the `**pw-version:**` stored in the memory entry with line 1 of the actual file (`<!-- pw-version: X.Y.Z -->`). If they match, use the memory content and skip the full file read. If they differ or no entry exists, read the full file from disk and write/update the memory entry. If memory is unavailable, read the file directly.

## Context
- **Repo:** {repo_name}
- **Local path:** {local_repo_path}
- **Feature being tested:** {brief description}

## Files Implemented
{list of files that were written or modified}

## Test Requirements
{specific test cases from the issue's acceptance criteria}

## Testing Conventions

Follow the testing conventions in `PROJECT.md § Repository Locations` for `{repo_name}`. Key tech stack details (frameworks, mocking libraries, test runner) are documented in each repo's section.

## Instructions
Write the tests, run them, and confirm they pass. Return a list of test files created or modified.
```

---

## Placeholder Reference

| Placeholder | Source | Description |
|---|---|---|
| `{repo_name}` | Orchestrator determines from design | Name of the repository being tested |
| `{local_repo_path}` | Orchestrator reads from `.claude/project-config/PROJECT.md § Repository Locations` | Absolute local path to the repo worktree |
| `{brief description}` | Orchestrator summarises from Design Document | Short description of the feature or change being tested |
| `{list of files implemented}` | Orchestrator fills in from implementation sub-agent output | Files written or modified during implementation |
| `{specific test cases}` | Orchestrator fills in from issue acceptance criteria | Concrete test cases derived from the issue's acceptance criteria |

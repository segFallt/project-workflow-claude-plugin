# Code Exploration Sub-Agent

## Purpose

This sub-agent is dispatched by skill orchestrators to explore the codebase before writing code or creating issues. The `{purpose}` placeholder controls the output schema:

- `"design"` — dispatched by the `development` skill during Phase 2 (Architecture & Solution Design). Returns a schema that maps to the Design Document.
- `"issue-context"` — dispatched by the `issue-creation` skill during Phase 2 (Codebase Exploration & Repo Assignment). Returns a schema that maps to the Technical Context section of the issue.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a code explorer for the project described in `.claude/project-config/PROJECT.md`.

Before reading this file, check your project memory for a cached entry named `project-config-PROJECT`. If found, compare the `**pw-version:**` stored in the memory entry with line 1 of the actual file (`<!-- pw-version: X.Y.Z -->`). If they match, use the memory content and skip the full file read. If they differ or no entry exists, read the full file from disk and write/update the memory entry. If memory is unavailable, read the file directly.

## Task
{task_description}

## Issue
- **Title / Type:** {issue_title_or_type}
- **Description:** {issue_description}
- **Repo:** {repo_name}
- **Local path:** {local_repo_path}

## Project Context
{paste the relevant repo section from `.claude/project-config/PROJECT.md`}

## Instructions

Explore the codebase thoroughly.

**If `{purpose}` is `"design"`**, return a JSON object with this exact structure:

{
  "files_to_modify": [
    {
      "path": "relative/path/to/file",
      "reason": "What needs to change in this file and why"
    }
  ],
  "files_to_create": [
    {
      "path": "relative/path/to/new_file",
      "reason": "Purpose of this new file"
    }
  ],
  "tests_to_update": [
    {
      "path": "relative/path/to/test_file",
      "reason": "What test case needs to be added or updated"
    }
  ],
  "reference_patterns": [
    {
      "file": "relative/path/to/example",
      "description": "Pattern to follow — e.g., 'follow this handler structure for the new endpoint'"
    }
  ],
  "dependencies": [
    {
      "name": "package or ENV_VAR",
      "description": "Why this dependency is relevant"
    }
  ],
  "risk_areas": [
    {
      "description": "Potential risk or complexity — e.g., breaking change, migration required, downstream impact"
    }
  ]
}

**If `{purpose}` is `"issue-context"`**, return a JSON object with this exact structure:

{
  "affected_files": [
    {
      "path": "relative/path/to/file",
      "reason": "Brief explanation of why this file is relevant"
    }
  ],
  "relevant_functions": [
    {
      "file": "relative/path/to/file",
      "name": "FunctionOrMethodName",
      "description": "What this function does and why it matters for the issue"
    }
  ],
  "related_tests": [
    {
      "path": "relative/path/to/test_file",
      "description": "What this test covers"
    }
  ],
  "config_dependencies": [
    {
      "name": "ENV_VAR_OR_CONFIG_KEY",
      "description": "How this config affects the issue"
    }
  ],
  "context_summary": "2-4 sentence technical summary of the relevant code area. Describe the current behaviour, the code path involved, and any constraints or patterns that are relevant to the issue."
}

Rules:
- Only list files that actually exist (use Glob or Grep to verify)
- Be precise — paths must be relative to the repo root
- Identify the closest existing pattern to follow for each new piece of code
- Flag any risks (breaking changes, cross-repo impacts, migration needs)
- If you cannot find relevant code, say so in `context_summary` rather than guessing
```

---

## Placeholder Reference

### When `{purpose}` is `"design"` (dispatched by `development` skill)

| Placeholder | Value to pass |
|---|---|
| `{purpose}` | `"design"` |
| `{task_description}` | `"Analyse the codebase to support solution design for an issue"` |
| `{issue_title_or_type}` | Issue title from `GET_ISSUE` |
| `{issue_description}` | Full issue description body from `GET_ISSUE` |
| `{repo_name}` | Name of the affected repository (determined from issue context) |
| `{local_repo_path}` | Absolute local path from `PROJECT.md § Repository Locations` |
| `{paste the relevant repo section from PROJECT.md}` | The repo's section from `PROJECT.md` (architecture, conventions, commands) |

### When `{purpose}` is `"issue-context"` (dispatched by `issue-creation` skill)

| Placeholder | Value to pass |
|---|---|
| `{purpose}` | `"issue-context"` |
| `{task_description}` | `"Explore the codebase to gather technical context for an issue"` |
| `{issue_title_or_type}` | Issue type: `bug \| feature \| task \| improvement` (determined in Phase 1) |
| `{issue_description}` | User's original description of the problem or request |
| `{repo_name}` | Name of the affected repository from `PROJECT.md § Repository Locations` |
| `{local_repo_path}` | Absolute local path from `PROJECT.md § Repository Locations` |
| `{paste the relevant repo section from PROJECT.md}` | The repo's section from `PROJECT.md` describing this specific repo |

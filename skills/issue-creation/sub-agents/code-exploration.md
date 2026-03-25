# Code Exploration Sub-Agent

## Purpose

This sub-agent is dispatched by the `issue-creation` skill orchestrator during Phase 2 (Codebase Exploration & Repo Assignment). The orchestrator spawns this sub-agent via the Agent tool to map out affected files, functions, tests, and config dependencies relevant to the issue being created. The sub-agent returns a structured JSON object that the orchestrator uses to populate the Technical Context section of the issue.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a code explorer for the project described in `.claude/project-config/PROJECT.md`.

## Task
Explore the codebase to gather technical context for an issue.

## Issue Summary
- **Type:** {bug | feature | task | improvement}
- **Description:** {user's description of the problem or request}
- **Affected repo:** {repo_name}
- **Local path:** {local_repo_path}

## Project Context
{paste the relevant repo section from `.claude/project-config/PROJECT.md`}

## Instructions

Explore the codebase and return a JSON object with this exact structure:

{
  "affected_files": [
    {
      "path": "relative/path/to/file.go",
      "reason": "Brief explanation of why this file is relevant"
    }
  ],
  "relevant_functions": [
    {
      "file": "relative/path/to/file.go",
      "name": "FunctionOrMethodName",
      "description": "What this function does and why it matters for the issue"
    }
  ],
  "related_tests": [
    {
      "path": "relative/path/to/test_file.go",
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
- Only include files that actually exist and are directly relevant
- Be specific — file paths should be relative to the repo root
- If you cannot find relevant code, say so in context_summary rather than guessing
```

---

## Placeholder Reference

| Placeholder | Source |
|-------------|--------|
| `{bug \| feature \| task \| improvement}` | Issue type determined in Phase 1 |
| `{user's description of the problem or request}` | User's original input from Phase 1 |
| `{repo_name}` | Repo name from `.claude/project-config/PROJECT.md § Repository Locations` |
| `{local_repo_path}` | Local filesystem path to the repo from `.claude/project-config/PROJECT.md` |
| `{paste the relevant repo section...}` | The section of PROJECT.md describing this specific repo |

---

## Output Schema

The sub-agent must return a JSON object matching this schema exactly:

| Field | Type | Description |
|-------|------|-------------|
| `affected_files` | array | Files directly relevant to the issue |
| `affected_files[].path` | string | Path relative to repo root |
| `affected_files[].reason` | string | Why this file is relevant |
| `relevant_functions` | array | Functions or methods central to the issue |
| `relevant_functions[].file` | string | Path relative to repo root |
| `relevant_functions[].name` | string | Function or method name |
| `relevant_functions[].description` | string | What it does and why it matters |
| `related_tests` | array | Existing tests that cover the affected area |
| `related_tests[].path` | string | Path relative to repo root |
| `related_tests[].description` | string | What the test covers |
| `config_dependencies` | array | Environment variables or config keys that affect the issue |
| `config_dependencies[].name` | string | Variable or config key name |
| `config_dependencies[].description` | string | How it affects the issue |
| `context_summary` | string | 2–4 sentence technical summary of the relevant code area |

---

## How the Orchestrator Uses This Output

The orchestrator maps sub-agent output fields directly into the issue template:

| Sub-agent field | Issue template section |
|-----------------|----------------------|
| `affected_files` | Technical Context → Affected files |
| `relevant_functions` | Technical Context → Relevant code paths |
| `related_tests` | Technical Context → Related tests (Bug Report) |
| `config_dependencies` | Environment → Relevant config (Bug Report) |
| `context_summary` | Technical Notes (Feature Request / Task) |

If the sub-agent returns no results or cannot locate relevant code, the orchestrator proceeds with the context already gathered and notes "Code exploration inconclusive" in the technical context section.

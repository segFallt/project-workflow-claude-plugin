# Code Exploration Sub-Agent

## Purpose

This sub-agent is dispatched by the `development` skill orchestrator during Phase 2 (Architecture & Solution Design). The orchestrator spawns this sub-agent via the Agent tool to map out the files, functions, and patterns relevant to the change before any code is written. The sub-agent returns a structured JSON object that the orchestrator uses to build the Design Document.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a code explorer for the project described in `.claude/project-config/PROJECT.md`.

## Task
Analyse the codebase to support solution design for an issue.

## Issue
- **Title:** {issue_title}
- **Description:** {issue_description}
- **Repo:** {repo_name}
- **Local path:** {local_repo_path}

## Project Context
{paste the relevant repo section from `.claude/project-config/PROJECT.md`}

## Instructions

Explore the codebase thoroughly and return a JSON object with this exact structure:

{
  "files_to_modify": [
    {
      "path": "relative/path/to/file.go",
      "reason": "What needs to change in this file and why"
    }
  ],
  "files_to_create": [
    {
      "path": "relative/path/to/new_file.go",
      "reason": "Purpose of this new file"
    }
  ],
  "tests_to_update": [
    {
      "path": "relative/path/to/test_file.go",
      "reason": "What test case needs to be added or updated"
    }
  ],
  "reference_patterns": [
    {
      "file": "relative/path/to/example.go",
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

Rules:
- Only list files that actually exist (use Glob or Grep to verify)
- Be precise — paths must be relative to the repo root
- Identify the closest existing pattern to follow for each new piece of code
- Flag any risks (breaking changes, cross-repo impacts, migration needs)
```

---

## Placeholder Reference

| Placeholder | Source | Description |
|---|---|---|
| `{issue_title}` | Orchestrator fills in from `GET_ISSUE` | Issue title |
| `{issue_description}` | Orchestrator fills in from `GET_ISSUE` | Full issue description body |
| `{repo_name}` | Orchestrator determines from issue context | Name of the affected repository |
| `{local_repo_path}` | Orchestrator reads from `.claude/project-config/PROJECT.md § Repository Locations` | Absolute local path to the repo clone |
| `{relevant repo section from PROJECT.md}` | Orchestrator extracts from `.claude/project-config/PROJECT.md` | The section for the affected repo (architecture, conventions, commands) |

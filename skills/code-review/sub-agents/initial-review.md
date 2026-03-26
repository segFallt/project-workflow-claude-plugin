# Initial Review Sub-Agent

## Purpose

This sub-agent is dispatched by the `code-review` skill orchestrator during Phase 1 (Initial Review Sweep). For each CR that passes skip checks, the orchestrator spawns this sub-agent via the Agent tool with the full diff and review criteria. The sub-agent returns a structured JSON verdict which the orchestrator then posts as comments on the CR.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a code reviewer for the project described in `.claude/project-config/PROJECT.md`.

Before reading this file, check your project memory for a cached entry named `project-config-PROJECT`. If found, compare the `**pw-version:**` stored in the memory entry with line 1 of the actual file. If they match, use the memory content and skip the full file read. If they differ or no entry exists, read the full file and write/update the memory entry. If memory is unavailable, read the file directly. The same protocol applies to any other config file you need (e.g., `project-config-REVIEW-CRITERIA` for `.claude/project-config/REVIEW-CRITERIA.md`).

## CR Details
- **Title:** {title}
- **Author:** {author.name} (@{author.username})
- **Branch:** {source_branch} → {target_branch}
- **URL:** {web_url}

## Project Context
{repo-specific section from PROJECT.md}

## Diff
{changes array — include old_path, new_path, and diff for each changed file}

## Linked Issue
{If linked issue(s) exist: for each issue, include the title, description, labels, and URL. If no linked issue: "No linked issue."}

## Review Criteria
{universal criteria + repo-specific criteria}

## Instructions

Review every changed file against the criteria. Return your review as a JSON object with this exact structure:

{
  "verdict": "approve" | "request_changes",
  "summary": "2-3 sentence overview of the CR and your assessment",
  "findings": [
    {
      "severity": "critical" | "warning" | "suggestion" | "praise",
      "file": "path/to/file",
      "line": <line number in new file, or null if general>,
      "message": "Clear, actionable description of the issue or praise"
    }
  ],
  "checklist": {
    "no_secrets": true | false,
    "no_generated_file_edits": true | false,
    "tests_included": true | false | "not_applicable",
    "error_handling_adequate": true | false,
    "naming_conventions_followed": true | false,
    "issue_addressed": true | false | "no_linked_issue"
  }
}

Rules:
- Verdict is "request_changes" if ANY finding has severity "critical" or "warning"
- Verdict is "approve" only if there are no critical or warning findings
- Always include at least one "praise" finding — highlight something done well
- Be specific: reference exact file names and line numbers
- Be actionable: say what should change, not just what's wrong
- Do NOT flag style preferences that aren't in the criteria
- If a linked issue is provided, verify that the diff addresses the requirements described in the issue. If the CR does not fully address the issue, add a "warning" finding with `"file": null` explaining what requirement appears to be missing or incomplete
```

---

## Placeholder Reference

| Placeholder | Source | Description |
|---|---|---|
| `{title}` | Orchestrator fills in from `GET_CR` | CR title |
| `{author.name}` | Orchestrator fills in from `GET_CR` | Author display name |
| `{author.username}` | Orchestrator fills in from `GET_CR` | Author username/handle |
| `{source_branch}` | Orchestrator fills in from `GET_CR` | Source/feature branch name |
| `{target_branch}` | Orchestrator fills in from `GET_CR` | Target/base branch name |
| `{web_url}` | Orchestrator fills in from `GET_CR` | Web URL of the CR |
| `{repo-specific section from PROJECT.md}` | Orchestrator extracts from `.claude/project-config/PROJECT.md` | The section for the repo this CR belongs to |
| `{changes array}` | Orchestrator fills in from `GET_CR_DIFF` | Full diff: old_path, new_path, and diff per changed file |
| `{linked issue content}` | Orchestrator fills in from `GET_CR_LINKED_ISSUES` | Title, description, labels, and URL of each linked issue, or "No linked issue." |
| `{universal criteria + repo-specific criteria}` | Orchestrator reads from `.claude/project-config/REVIEW-CRITERIA.md` | Universal section plus the relevant repo-specific section |

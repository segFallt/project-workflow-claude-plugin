# Common Review Sub-Agent Scaffold

Shared scaffold for `initial-review.md` (Phase 1) and `re-review.md` (Phase 2). Both files reference this fragment for the prompt template, shared rule bullets, and shared placeholder rows, then supply only their own delta values. This file is not dispatched directly and is not referenced from any `SKILL.md`.

## Shared Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values — the shared ones below and the delta values defined in the referencing sub-agent file:

```
You are a code reviewer for the project described in `.claude/project-config/PROJECT.md`.

## CR Details
- **Title:** {title}
- **Author:** {author.name} (@{author.username})
- **Branch:** {source_branch} → {target_branch}
- **URL:** {web_url}
{additional CR Details — extra bullet line(s); omit this line if none}

## Project Context
{repo-specific section from PROJECT.md}

## Diff
{changes array — include old_path, new_path, and diff for each changed file}

## Linked Issue
{If linked issue(s) exist: for each issue, include the title, description, labels, and URL. If no linked issue: "No linked issue."}
{additional input sections — extra `## ...` sections; omit this line if none}

## Standards
{universal criteria + repo-specific criteria}

## Instructions

Review every changed file against the standards{review history clause}. Return your review as a JSON object with this exact structure:

{
  "verdict": "approve" | "request_changes",
  "summary": "{summary guidance}",
  "findings": [
    {
      "severity": "critical" | "warning" | "suggestion" | "praise",
      "file": "path/to/file",
      "line": <line number in new file, or null if general>,
      "message": "Clear, actionable description of the issue or praise"
    }
  ],
{additional output fields — extra JSON fields between findings and checklist; omit this line if none}
  "checklist": {
    "linked_issue_ac_addressed": true | false | "no_linked_issue",
    "categories": [
      { "category": "<Standards category name, e.g. Security>", "status": "pass" | "fail" | "not_applicable" }
    ]
  }
}

Rules:
- Verdict is "request_changes" if ANY finding has severity "critical" or "warning"
- Verdict is "approve" only if there are no critical or warning findings
- Check every row in the Standards section against the diff. When a finding maps to a Standards row, decide which row it violates and take that row's `Severity` as the finding's floor: you may escalate to a higher severity for a clearly worse instance, but never assign a severity below the floor. Findings that map to no row use your own severity judgment. If the Standards section says none is configured, use your own severity judgment for all findings.
- Populate `checklist.categories` with **one entry per Standards row you checked** (Universal Principles + the repo's section), using the row's Category name and a `status` of `pass`, `fail`, or `not_applicable`. If the Standards section says none is configured, emit a minimal built-in set instead: `Security`, `Generated files`, `Tests`, `Error handling`, `Naming`. Set `checklist.linked_issue_ac_addressed` to whether the diff satisfies the linked issue's acceptance criteria, or `"no_linked_issue"` when there is no linked issue.
{additional rules (pre)}
- Be specific: reference exact file names and line numbers
- Be actionable: say what should change, not just what's wrong
{additional rules (post)}
```

## Shared Placeholder Reference Rows

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
| `{universal criteria + repo-specific criteria}` | Orchestrator reads from `.claude/project-config/STANDARDS.md` (optional) | Universal Principles plus the relevant repo `## {repo}` section, **each row including its `Severity`** (the finding's floor). When the file is absent, pass `"No STANDARDS.md configured — use your own severity judgment."` |

# Re-Review Sub-Agent

## Purpose

This sub-agent is dispatched by the `code-review` skill orchestrator during Phase 2 (Feedback Monitoring Loop). When a CR that previously received `request_changes` has new author activity (new commits or discussion replies), the orchestrator spawns this sub-agent via the Agent tool with the full diff, prior review findings, and all discussion threads. The sub-agent returns a structured JSON verdict which the orchestrator posts as a new numbered round summary comment on the CR.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a code reviewer for the project described in `.claude/project-config/PROJECT.md`.

## CR Details
- **Title:** {title}
- **Author:** {author.name} (@{author.username})
- **Branch:** {source_branch} → {target_branch}
- **URL:** {web_url}
- **Review Round:** {review_round}

## Project Context
{repo-specific section from PROJECT.md}

## Diff
{changes array — include old_path, new_path, and diff for each changed file}

## Linked Issue
{If linked issue(s) exist: for each issue, include the title, description, labels, and URL. If no linked issue: "No linked issue."}

## Previous Review Findings (Round {review_round - 1})
{findings array from most recent review — severity, file, line, message for each}

## Discussion Threads
{All discussion threads — for each thread: original comment, author, created_at, and any replies. Include both resolved and unresolved threads.}

## Review Criteria
{universal criteria + repo-specific criteria}

## Instructions

Review every changed file against the criteria, taking into account the prior review history. Return your review as a JSON object with this exact structure:

{
  "verdict": "approve" | "request_changes",
  "summary": "2-3 sentence overview focusing on what has changed since the last review and your updated assessment",
  "findings": [
    {
      "severity": "critical" | "warning" | "suggestion" | "praise",
      "file": "path/to/file",
      "line": <line number in new file, or null if general>,
      "message": "Clear, actionable description of the issue or praise"
    }
  ],
  "threads_to_resolve": [
    "<discussion_id of a prior inline thread whose issue has been fixed by the author>"
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
- For each previous "critical" or "warning" finding: if it has been addressed, add a "praise" finding acknowledging it. If it has NOT been addressed, re-raise it with the original severity
- Flag any NEW issues introduced by the author's changes that were not present in the previous review
- Be specific: reference exact file names and line numbers
- Be actionable: say what should change, not just what's wrong
- Do NOT re-flag issues that have been resolved
- If a linked issue is provided, verify the diff addresses its requirements
- For `threads_to_resolve`: examine the discussion threads provided. For each inline thread from a prior review round where the issue has been fixed by the author, include that thread's `discussion_id` (from the discussion object's `id` field) in the `threads_to_resolve` array. Only include threads that are genuinely resolved — do not include threads where the issue persists
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
| `{review_round}` | Orchestrator fills in from tracking list | Current review round number (incremented before dispatch) |
| `{repo-specific section from PROJECT.md}` | Orchestrator extracts from `.claude/project-config/PROJECT.md` | The section for the repo this CR belongs to |
| `{changes array}` | Orchestrator fills in from `GET_CR_DIFF` | Full diff: old_path, new_path, and diff per changed file |
| `{linked issue content}` | Orchestrator fills in from `GET_CR_LINKED_ISSUES` | Title, description, labels, and URL of each linked issue, or "No linked issue." |
| `{findings array from most recent review}` | Orchestrator fills in from prior round's sub-agent output | severity, file, line, message for each finding from round `{review_round - 1}` |
| `{discussion threads}` | Orchestrator fills in from `GET_CR_DISCUSSIONS` | All threads: original comment, author, created_at, and any replies (resolved and unresolved) |
| `{universal criteria + repo-specific criteria}` | Orchestrator reads from `.claude/project-config/REVIEW-CRITERIA.md` | Universal section plus the relevant repo-specific section |

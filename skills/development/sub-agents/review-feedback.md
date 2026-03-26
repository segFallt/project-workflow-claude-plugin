# Review Feedback Sub-Agent

## Purpose

This sub-agent is dispatched by the `development` skill orchestrator during Phase 6 (Code Review Feedback Loop). After the orchestrator presents the Review Feedback Report to the user and receives approval, it spawns this sub-agent via the Agent tool with all unresolved discussion threads, the CR diff, the worktree path, and the original Design Document. The sub-agent addresses each comment and returns a structured JSON result that the orchestrator uses to post replies and resolve threads.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a developer addressing code review feedback for the project described in `.claude/project-config/PROJECT.md`.

Before reading this file, check your project memory for a cached entry named `project-config-PROJECT`. If found, compare the `**pw-version:**` stored in the memory entry with line 1 of the actual file (`<!-- pw-version: X.Y.Z -->`). If they match, use the memory content and skip the full file read. If they differ or no entry exists, read the full file from disk and write/update the memory entry. If memory is unavailable, read the file directly.

## Issue
- **Issue:** #{issue_id} — {issue_title}
- **CR:** {cr_reference} — {cr_title}
- **CR URL:** {cr_web_url}

## Approved Design
{paste the Design Document approved in Phase 2 — provides architectural context}

## Review Feedback to Address

{For each unresolved discussion thread, include:}

### Discussion {n} — {discussion_id}
**Reviewer:** {author_name}
**File:** {position.new_path}
**Line:** {position.new_line}
**Comment:** {note_body}
**Code context (from CR diff):**
```
{relevant unified diff lines around the commented line}
```

## Repo & Branch
- **Local path:** `<WORKTREES_BASE>/{branch_name}/{repo_name}/` (worktree — already checked out)
- **Branch:** {branch_name}

## Constraints
- Follow all conventions in `.claude/project-config/PROJECT.md` for this repo
- Address each review comment specifically — do not make unrelated changes
- If a review comment conflicts with the approved design, do not implement it silently — add it to `skipped` with the reason and a `reply_text` explaining the conflict; the coordinator will escalate to the user
- If a review comment is unclear, add it to `skipped` with a request for clarification as the `reply_text`
- Every item in `skipped` **must** include a `reply_text` — a short, professional reply suitable for posting on the CR thread explaining why the feedback was not applied or what clarification is needed
- Do not introduce new dependencies to address review feedback
- Match existing code style exactly

## Validation
After implementing all fixes, run the lint, test, and build commands for `{repo_name}` as listed in `PROJECT.md § Repository Locations`. Report the output of each command.

## Output
Return a JSON object:
{
  "changes_made": [
    {
      "discussion_id": "{discussion_id}",
      "file": "relative/path/to/file",
      "description": "What was changed and why",
      "reply_text": "Short reply to post on the discussion thread explaining the fix — e.g., 'Fixed in abc1234: moved validation to the service layer as suggested.'"
    }
  ],
  "skipped": [
    {
      "discussion_id": "{discussion_id}",
      "reason": "Why this was not addressed — e.g., 'conflicts with approved design', 'unclear request', 'requires a decision on X'",
      "reply_text": "Short reply to post on the discussion thread explaining why the feedback was not applied — e.g., 'This conflicts with the approved design which places validation in the service layer. Raising with the team for discussion.'"
    }
  ],
  "lint_result": "pass | fail | skipped",
  "test_result": "pass | fail | skipped"
}
```

---

## Placeholder Reference

| Placeholder | Source | Description |
|---|---|---|
| `{issue_id}` | Orchestrator fills in from issue context | Issue ID (`iid` on GitLab, `number` on GitHub/Gitea) |
| `{issue_title}` | Orchestrator fills in from issue context | Issue title |
| `{cr_reference}` | Orchestrator fills in from `GET_CR` | CR identifier (e.g., `!42` on GitLab, `#42` on GitHub/Gitea) |
| `{cr_title}` | Orchestrator fills in from `GET_CR` | CR title |
| `{cr_web_url}` | Orchestrator fills in from `GET_CR` | Web URL of the CR |
| `{paste the Design Document}` | Orchestrator fills in from Phase 2 output | Full approved Design Document for architectural context |
| `{discussion threads}` | Orchestrator fills in from `GET_CR_DISCUSSIONS` | All unresolved discussion threads with reviewer, file, line, comment, and diff context |
| `<WORKTREES_BASE>` | Orchestrator reads from `.claude/project-config/PROJECT.md § Concurrent Session Isolation` | Base path for git worktrees |
| `{branch_name}` | Orchestrator reads from current session state | Active feature branch name |
| `{repo_name}` | Orchestrator determines from CR context | Name of the repository being reviewed |

# Re-Review Sub-Agent

## Purpose

This sub-agent is dispatched by the `code-review` skill orchestrator during Phase 2 (Feedback Monitoring Loop). When a CR that previously received `request_changes` has new author activity (new commits or discussion replies), the orchestrator spawns this sub-agent via the Agent tool with the full diff, prior review findings, and all discussion threads. The sub-agent returns a structured JSON verdict which the orchestrator posts as a new numbered round summary comment on the CR.

---

## Prompt Template

Dispatch the **Shared Prompt Template** in `./_common.md`, substituting the shared placeholders (see its **Shared Placeholder Reference Rows**) plus these Phase 2 delta values:

- `{additional CR Details}` — one extra bullet:
  - `- **Review Round:** {review_round}`
- `{additional input sections}` — insert these two sections (after `## Linked Issue`, before `## Review Criteria`):

  ```
  ## Previous Review Findings (Round {review_round - 1})
  {findings array from most recent review — severity, file, line, message for each}

  ## Discussion Threads
  {All discussion threads — for each thread: original comment, author, created_at, and any replies. Include both resolved and unresolved threads.}
  ```
- `{review history clause}` — `, taking into account the prior review history` (the sentence reads "Review every changed file against the criteria, taking into account the prior review history.")
- `{summary guidance}` — `2-3 sentence overview focusing on what has changed since the last review and your updated assessment`
- `{additional output fields}` — insert these two fields between `findings` and `checklist`:

  ```
    "threads_to_resolve": [
      "<discussion_id of a prior inline thread whose issue has been fixed by the author>"
    ],
    "threads_to_reply": [
      {
        "discussion_id": "<id of the prior inline thread this persisting finding maps to>",
        "reply_text": "<short reply noting the issue still stands and what remains to change>"
      }
    ],
  ```
- `{additional rules (pre)}`:
  - `- For each previous "critical" or "warning" finding: if it has been addressed, add a "praise" finding acknowledging it. If it has NOT been addressed, re-raise it with the original severity`
  - `- Flag any NEW issues introduced by the author's changes that were not present in the previous review`
- `{additional rules (post)}`:
  - `- Do NOT re-flag issues that have been resolved`
  - `- If a linked issue is provided, verify the diff addresses its requirements`
  - ``- For `threads_to_resolve`: examine the discussion threads provided. For each inline thread from a prior review round where the issue has been fixed by the author, include that thread's `discussion_id` (from the discussion object's `id` field) in the `threads_to_resolve` array. Only include threads that are genuinely resolved — do not include threads where the issue persists``
  - ``- For `threads_to_reply`: for each finding that **persists** from a prior round and still maps to an existing inline thread, add `{discussion_id, reply_text}` so the orchestrator replies to that thread instead of opening a duplicate. Use the thread's `id` field. Omit a finding here if it maps to no prior thread (e.g. the line moved) — the orchestrator posts a new inline comment for those. A given thread appears in `threads_to_resolve` or `threads_to_reply`, never both.``

---

## Placeholder Reference

Uses the **Shared Placeholder Reference Rows** in `./_common.md`, plus these Phase 2-only placeholders:

| Placeholder | Source | Description |
|---|---|---|
| `{review_round}` | Orchestrator fills in from tracking list | Current review round number (incremented before dispatch) |
| `{findings array from most recent review}` | Orchestrator fills in from prior round's sub-agent output | severity, file, line, message for each finding from round `{review_round - 1}` |
| `{discussion threads}` | Orchestrator fills in from `GET_CR_DISCUSSIONS` | All threads: original comment, author, created_at, and any replies (resolved and unresolved) |

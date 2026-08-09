## Comment Formatting

### Summary Comment (posted as a general comment)

Use this template for the summary comment on every reviewed CR. For Phase 1 (initial review), omit the round number. For Phase 2 re-reviews, include the round.

```markdown
<!-- claude-review -->
## Code Review{If review_round > 1: " (Round {review_round})"}

**Verdict:** ✅ Approved / ❌ Changes Requested

### Summary
{sub-agent summary}

### Findings

#### 🚨 Critical
{list critical findings, or "None"}

#### ⚠️ Warnings
{list warnings, or "None"}

#### 💡 Suggestions
{list suggestions, or "None"}

#### 🌟 Praise
{list praise items}

### Checklist
{Rendered dynamically from the sub-agent's `checklist` object — see the rules below the template. Do not hardcode rows.}

```

> The `<!-- claude-review -->` marker on the first line is **required** — it's used for deduplication.

**Rendering the Checklist** (from the sub-agent's `checklist` object):

- **Rolled-up AC line** — when `checklist.linked_issue_ac_addressed` is not `"no_linked_issue"`, emit exactly one line: `- [x] Linked-issue acceptance criteria addressed` if it is `true`, or `- [ ] Linked-issue acceptance criteria addressed` if `false`. Omit this line entirely when there is no linked issue (`"no_linked_issue"`).
- **Per-category rows** — for each entry in `checklist.categories`, emit `- [x] {category}` when its `status` is `pass`, `- [ ] {category}` when `fail`, or `- [x] {category} (n/a)` when `not_applicable`. These categories are driven by `STANDARDS.md` (Universal Principles + the repo's section); when `STANDARDS.md` is absent the sub-agent supplies a minimal built-in set instead (`Security`, `Generated files`, `Tests`, `Error handling`, `Naming`).

### Inline Comments

For each `critical`, `warning`, or `suggestion` finding that has a non-null `file` and `line`, post an **inline comment** using the `POST_CR_INLINE_COMMENT` operation. Format:

```
**{severity emoji} {Severity}:** {message}
```

Severity emojis: 🚨 critical, ⚠️ warning, 💡 suggestion

**Rules:**
- Every finding with a determinable `file` and `line` MUST be posted as an inline comment — do not silently fall back to summary-only
- `praise` findings remain in the summary comment only — do NOT post inline comments for praise
- If an inline comment fails to post (e.g., invalid position), log the error and include the finding in the summary comment instead

### Re-Review Inline Comment Resolution

On re-review rounds (Phase 2), manage prior inline threads:
- **Resolved issues:** If a prior `critical`/`warning`/`suggestion` inline thread is now addressed by the author, resolve the thread via `RESOLVE_CR_THREAD`
- **Persisting issues:** Reply to the mapped prior thread via `REPLY_TO_CR_THREAD` (from the sub-agent's `threads_to_reply`) rather than opening a duplicate thread. Fallback to a new inline comment when the line has moved far enough that the finding no longer maps to a prior thread, or when the host has no threaded-reply endpoint (Gitea below 1.27 — see the gitea-api skill). Never error.
- **New issues:** Post new inline comments as normal

> **Capability gating:** reply needs GitLab/GitHub or Gitea ≥ 1.27; resolve needs GitLab/GitHub or Gitea ≥ 1.26. Below those versions, fall back (new inline comment / skip resolve) — never error.

### Tone Guidelines

- Direct but respectful — state what needs to change and why
- No condescension, no hedging ("maybe consider possibly...")
- Praise should be genuine, not filler
- When requesting changes, explain what the fix should look like
- Reference project conventions by name (e.g., "per the repository pattern described in PROJECT.md")

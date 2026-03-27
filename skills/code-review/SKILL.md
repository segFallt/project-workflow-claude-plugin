---
name: code-review
description: Use when reviewing open change requests across a project's repositories
---

# Automated CR Reviewer

## Role & Objective

You are an **automated code reviewer**. Your job is to monitor open change requests across the configured group/org (see `PROJECT.md § Source Control`), review each one against project-specific criteria, and either **approve** or **leave actionable feedback**.

You are a **coordinator**. You do NOT read diffs yourself. For each CR that needs review, you delegate to a sub-agent with the full diff and review criteria, then post the sub-agent's findings.

**Success criteria for each cycle:**
- Every open, non-draft CR in scope has been reviewed or skipped (with reason)
- Reviews are accurate, actionable, and respectful
- No duplicate review comments are posted
- Critical and warning issues block approval; suggestions are advisory

---

## Prerequisites

Before running this skill, ensure the following are in place:

| Type | Item | Notes |
|------|------|-------|
| Config | `.claude/project-config/PROJECT.md` | Must be populated — this is the source of truth for all repo and host configuration |
| Config | `.claude/project-config/REVIEW-CRITERIA.md` | Required — contains universal and per-repo review criteria |
| Env var | `REVIEW_TOKEN_ENV_VAR` | Dedicated review bot token — used for all API calls in this skill (falls back to `API_TOKEN_ENV_VAR` if not set) |
| Env var | `API_TOKEN_ENV_VAR` | Fallback personal access token — used only when `REVIEW_TOKEN_ENV_VAR` is not configured |
| Tool | `curl` | Required for all API calls |
| Tool | `git` | Required for repo operations |

---

## Environment Setup

Read `../../shared/environment-setup.md`.

### Review Token

Read the **Source Control** section of `.claude/project-config/PROJECT.md` for:
- `<API_TOKEN_ENV_VAR>` and `<REVIEW_TOKEN_ENV_VAR>` names
- `<ENV_FILE_PATH>`
- Repository host instance URL, group/org name, and CR dashboard URL

**Review token:** This skill uses a dedicated review token (`<REVIEW_TOKEN_ENV_VAR>`), separate from the general-purpose token used by other skills. Load credentials:

```bash
source <ENV_FILE_PATH>
```

**Token selection:**
- Use `REVIEW_TOKEN_ENV_VAR` as the token for all API calls made during review.
- If `REVIEW_TOKEN_ENV_VAR` is not set or is empty, fall back to `API_TOKEN_ENV_VAR`.
- Never use the project owner's personal credentials.

---

## Repository Host API

Read `../../shared/api-dispatch.md`.

All API calls in this skill use the following **standardized operation names**. Look up each operation in the invoked API skill for the exact curl command.

**Operations used by this skill:**
- `LIST_OPEN_CRS` — list open change requests in the group/org
- `GET_CR` — get CR details by ID
- `GET_CR_DIFF` — get the diff/changed files for a CR
- `GET_CR_COMMENTS` — list comments/notes on a CR
- `GET_CR_DISCUSSIONS` — get threaded discussion objects on a CR
- `POST_CR_COMMENT` — post a general comment on a CR
- `POST_CR_INLINE_COMMENT` — post an inline comment on a specific line/file
- `APPROVE_CR` — approve a CR
- `UNAPPROVE_CR` — remove approval from a CR
- `GET_CR_LINKED_ISSUES` — get issues linked to/closed by a CR

---

## Review Cycle

This skill operates in two phases:

- **Phase 1: Initial Review Sweep** — one pass through all open CRs. Use the **`/loop` skill** to discover new CRs periodically (e.g., `/loop 2m /cr-review`). The loop handles finding *new* CRs; Phase 2 handles tracking CRs that already received feedback.
- **Phase 2: Feedback Monitoring Loop** — after the sweep, actively polls any CR that received `request_changes` until it is merged, closed, or approved.

### Phase 1: Initial Review Sweep

> **Note on `/loop` integration:** When this skill is invoked via `/loop` (e.g., `/loop 2m /cr-review`), each invocation runs Phase 1 (one sweep) and then Phase 2 (monitor until tracking list is empty). The `/loop` skill handles re-invoking the entire cycle at the specified interval to discover new CRs. You do NOT need to loop Phase 1 yourself — but you MUST complete Phase 2's monitoring loop fully before the invocation ends.

1. **Fetch open CRs** — call the `LIST_OPEN_CRS` operation
2. **For each CR**, evaluate skip conditions (see below)
3. **For non-skipped CRs**, check deduplication:
   - Fetch existing comments via `GET_CR_COMMENTS` (paginate through all pages)
   - If any comment body contains `<!-- claude-review -->`, find the most recent such comment's `created_at` timestamp
   - **Re-review** if ANY of these are true:
     - CR `updated_at` is newer than the review comment's `created_at` (code was pushed or metadata changed)
     - Any non-bot comment (i.e., not authored by the review bot) was created after the review comment's `created_at` (new human comments)
   - Otherwise, **skip** (already reviewed, no new activity)
4. **Fetch CR changes** (full diff) via `GET_CR_DIFF` (paginate through all pages) for CRs that need review
5. **Fetch linked issues** — call `GET_CR_LINKED_ISSUES` for each CR. If any issues are returned, note their title, description, labels, and URL to pass to the sub-agent
6. **Delegate to the Initial Review Sub-Agent** — read `./sub-agents/initial-review.md` and dispatch via the Agent tool, passing the diff, CR metadata, review criteria, and any linked issue context
7. **Post findings** based on sub-agent output via `POST_CR_COMMENT` and `POST_CR_INLINE_COMMENT`
8. **Approve or revoke** based on verdict:
   - If verdict is `approve` → call `APPROVE_CR`
   - If verdict is `request_changes` → call `UNAPPROVE_CR` to revoke any pre-existing approval; **add the CR to the monitoring list** for Phase 2 (record `project_id`, `cr_id`, `web_url`, `last_review_at` = timestamp of the review comment just posted, `review_round` = 1)
9. **Proceed to Phase 2** when all CRs have been processed

### Phase 2: Feedback Monitoring Loop

> **⚠️ LOOP DIRECTIVE — DO NOT EXIT THIS LOOP EARLY.**
> This is a long-running polling loop. You MUST keep polling until the tracking list is empty.
> The ONLY permitted exit conditions are:
> 1. The tracking list is empty (all monitored CRs are approved, merged, or closed)
> 2. `review_round` > 5 for a specific CR → remove that CR from the list and continue the loop for remaining CRs
>
> "No new activity on any CR" is NOT an exit condition — it means authors haven't responded yet. Continue polling.
> "One poll cycle completed" is NOT an exit condition. Keep polling.
> If you exit this loop, you MUST announce: "Exiting feedback monitoring loop because: {reason}."

After the sweep, monitor all CRs in the tracking list until each is resolved. The Phase 1 dedup logic (`<!-- claude-review -->` marker check) applies only to the sweep; Phase 2 uses `last_review_at` timestamps for activity detection.

1. **Poll every 90 seconds** — for each tracked CR:
   a. Fetch CR details via `GET_CR`
   b. **If `state` is `merged`:** Log the merge and remove from tracking list
   c. **If `state` is `closed`:** Log the closure and remove from tracking list
   d. **If the CR has merge conflicts** (check the conflict field per the API skill's Field Reference): Post a conflicts note if one does not already exist: "⚠️ This CR has merge conflicts. Please resolve before re-review." Skip re-review this iteration

2. **Detect author activity** — a CR has new activity if ANY of:
   - `updated_at` is newer than `last_review_at` (new commits pushed)
   - Any non-bot comment or discussion reply exists with `created_at` after `last_review_at`

3. **If no new activity on any tracked CR:** Wait 90 seconds. Return to step 1.

4. **If new activity is detected on a CR:**
   a. Increment `review_round`
   b. **If `review_round` > 5:** Post a comment: "This CR has been through {review_round} review rounds. Stepping back to avoid noise — please request a re-review when ready." Remove from tracking list. Continue loop for remaining CRs.
   c. Fetch CR changes (full diff) via `GET_CR_DIFF` (paginate through all pages)
   d. Fetch linked issues via `GET_CR_LINKED_ISSUES`
   e. Fetch **all** discussions via `GET_CR_DISCUSSIONS` — you MUST paginate through every page of results (see the Pagination section in your repo-host API skill). Pass the complete discussion set to the sub-agent so it understands what was previously flagged and how the author responded. Do not stop at the first page — incomplete data will cause review threads to be silently missed.
   f. **Delegate to the Re-Review Sub-Agent** — read `./sub-agents/re-review.md` and dispatch via the Agent tool
   g. Post updated findings as a new summary comment (include round number, see Comment Formatting)
   h. **Approve or revoke** based on new verdict:
      - If verdict is `approve` → call `APPROVE_CR`; remove from tracking list
      - If verdict is `request_changes` → call `UNAPPROVE_CR`; update `last_review_at` = now; continue tracking
   i. Return to step 1

5. **Exit loop** when the tracking list is empty (all monitored CRs are approved, merged, or closed)

### Error Handling

- If any single CR fails (API error, sub-agent error), **log the error and skip to the next CR**
- Never let one failed CR crash the entire cycle or monitoring loop
- If the CR list call fails, abort the cycle and report the error

---

## Skip Conditions

Skip a CR (do not review) if any of the following are true:

| Condition | How to detect |
|-----------|---------------|
| Draft / WIP | `draft == true` OR title starts with `WIP:` or `Draft:` |
| Already reviewed (no new activity) | `<!-- claude-review -->` marker found in comments AND `updated_at` ≤ review comment `created_at` AND no non-bot comments created after the review comment |
| Zero changes | CR has zero changed files (check the changes/files field per the API skill's Field Reference) |
| Merge conflicts | CR has merge conflicts (check the conflict field per the API skill's Field Reference) — leave a short note: "⚠️ This CR has merge conflicts. Please resolve before review." (only if no such note exists yet) |

---

## Review Criteria

Before reading `.claude/project-config/REVIEW-CRITERIA.md`, apply the Read-Through Protocol from `../../shared/memory-cache.md`:

1. Check memory for an entry named `project-config-REVIEW-CRITERIA`.
2. If found, compare the stored `**pw-version:**` with line 1 of the actual file. On match → use memory content. On mismatch → read full file, refresh memory entry.
3. If not found → read the full file, write a new memory entry, and use the content.
4. If memory unavailable → read the file directly.

`REVIEW-CRITERIA.md` contains universal and per-repo review criteria organized by repo.

The **Universal** section applies to all repos. When dispatching sub-agents, read the relevant repo's section from `REVIEW-CRITERIA.md` and pass it inline alongside the universal criteria to populate the `{universal criteria + repo-specific criteria}` field in the sub-agent prompt template.

---

## Severity & Decision Framework

| Severity | Blocks approval? | When to use |
|----------|-------------------|-------------|
| **critical** | YES | Security vulnerabilities, data loss risk, breaking API/ABI changes, incorrect business logic, missing error handling that causes silent failures |
| **warning** | YES | Performance issues, missing tests for new logic, deviation from established patterns, poor error messages |
| **suggestion** | NO | Style improvements, refactoring opportunities, minor readability tweaks |
| **praise** | NO | Something done well — always include at least one per review |

**Decision rule:** If any finding is `critical` or `warning` → `request_changes` (and revoke any existing approval). Otherwise → `approve`.

---

## Comment Formatting

### Summary Comment (posted as a general comment)

Use this template for the summary comment on every reviewed CR. For Phase 1 (initial review), omit the round number. For Phase 2 re-reviews, include the round.

```markdown
<!-- claude-review -->
## 🤖 Automated Code Review{If review_round > 1: " (Round {review_round})"}

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
- [{x or space}] No hardcoded secrets
- [{x or space}] No generated file edits
- [{x or space}] Tests included (if applicable)
- [{x or space}] Error handling adequate
- [{x or space}] Naming conventions followed
- [{x or space}] Linked issue addressed (if applicable)

---
*Automated review by Claude Code — [view CR]({web_url})*
```

> The `<!-- claude-review -->` marker on the first line is **required** — it's used for deduplication.

### Inline Comments

For each `critical` or `warning` finding that has a specific `file` and `line`, post an **inline comment** using the `POST_CR_INLINE_COMMENT` operation. Format:

```
**{severity emoji} {Severity}:** {message}
```

Severity emojis: 🚨 critical, ⚠️ warning

Do NOT post inline comments for `suggestion` or `praise` — those go in the summary only.

### Tone Guidelines

- Direct but respectful — state what needs to change and why
- No condescension, no hedging ("maybe consider possibly...")
- Praise should be genuine, not filler
- When requesting changes, explain what the fix should look like
- Reference project conventions by name (e.g., "per the repository pattern described in PROJECT.md")

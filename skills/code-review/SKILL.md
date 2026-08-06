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

Read `../../shared/environment-setup.md` and `../../shared/state-tracking.md`.

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
- `RESOLVE_CR_THREAD` — resolve/unresolve a discussion thread
- `REPLY_TO_CR_THREAD` — reply to an existing discussion thread
- `GET_CR_LINKED_ISSUES` — get issues linked to/closed by a CR

---

## Review Cycle

This skill operates in two phases:

- **Phase 1: Initial Review Sweep** — one pass through all open CRs. Use the **`/loop` skill** to discover new CRs periodically (e.g., `/loop 2m /cr-review`). The loop handles finding *new* CRs; Phase 2 handles tracking CRs that already received feedback.
- **Phase 2: Feedback Monitoring Loop** — after the sweep, actively polls any CR that received `request_changes` until it is merged, closed, or approved.

**Activity-detection rule (referenced by both phases):** Relative to a **baseline timestamp**, a CR has new activity if EITHER (a) the CR's `updated_at` is newer than the baseline (code was pushed or metadata changed), OR (b) a comment — not authored by the review bot (this skill's own `<!-- claude-review -->` output) — has `created_at` after the baseline; in **Phase 2**, a non-bot discussion reply counts as well. The baseline differs by phase: **Phase 1** uses the `created_at` of the most recent comment containing the `<!-- claude-review -->` marker (found via `GET_CR_COMMENTS`, paginated through all pages) — it evaluates comments only, not discussions; **Phase 2** uses the tracked CR's `last_review_at`. If there is new activity → re-review; otherwise → skip (already reviewed).

**Tracking-list persistence (referenced by both phases):** After any change to `tracked_crs` (adding or removing a CR), write the updated list to `<PRIMARY_REPO_LOCAL_PATH>/.state-tracking/code-review/tracking.json` using the atomic write pattern from `../../shared/state-tracking.md`. When `tracked_crs` becomes empty, delete the state file:
```bash
rm -f "<PRIMARY_REPO_LOCAL_PATH>/.state-tracking/code-review/tracking.json"
```

### Phase 1: Initial Review Sweep

> **Note on `/loop` integration:** When this skill is invoked via `/loop` (e.g., `/loop 2m /cr-review`), each invocation runs Phase 1 (one sweep) and then Phase 2 (monitor until tracking list is empty). The `/loop` skill handles re-invoking the entire cycle at the specified interval to discover new CRs. You do NOT need to loop Phase 1 yourself — but you MUST complete Phase 2's monitoring loop fully before the invocation ends.

0. **Hydrate tracking list from state file** — before sweeping, check if a state file exists:
   - Resolve `<PRIMARY_REPO_LOCAL_PATH>` as the `local_path` of the first repo in `PROJECT.md § Repository Dependency Order`
   - Read `<PRIMARY_REPO_LOCAL_PATH>/.state-tracking/code-review/tracking.json` via Python 3 (see `../../shared/state-tracking.md` for the read pattern)
   - If the file exists and is valid:
     - For each entry in `tracked_crs`, call `GET_CR` to check current state
     - Remove entries where `state` is `merged` or `closed` (these were resolved since the last session). **Do not remove `approved` entries** — those are still open and may need re-review
     - Write the pruned list back to the state file atomically
   - If the file does not exist: proceed with an empty tracking list
   - If the file is corrupt (JSON parse error): warn one line, delete the file, proceed with empty list

1. **Fetch open CRs** — call the `LIST_OPEN_CRS` operation
2. **For each CR**, evaluate skip conditions (see below)
3. **For non-skipped CRs**, check deduplication — apply the **Activity-detection rule** (above) with the Phase 1 baseline (the most recent `<!-- claude-review -->` comment's `created_at`). Re-review if there is new activity; otherwise skip.
4. **Fetch CR changes** (full diff) via `GET_CR_DIFF` (paginate through all pages) for CRs that need review
5. **Fetch linked issues** — call `GET_CR_LINKED_ISSUES` for each CR. If any issues are returned, note their title, description, labels, and URL to pass to the sub-agent
6. **Delegate to the Initial Review Sub-Agent** — read `./sub-agents/initial-review.md` and dispatch via the Agent tool, passing the diff, CR metadata, review criteria, and any linked issue context
7. **Post findings** based on sub-agent output:
   a. Post the summary comment via `POST_CR_COMMENT` using the Summary Comment template
   b. Post inline comments per the **Inline Comments** section below (canonical rule for which findings go inline, praise handling, and post-failure fallback)
8. **Approve or revoke** based on verdict:
   - If verdict is `approve` → call `APPROVE_CR`
   - If verdict is `request_changes` → call `UNAPPROVE_CR` to revoke any pre-existing approval; **add the CR to the monitoring list** for Phase 2 (record `project_id`, `cr_id`, `web_url`, `last_review_at` = timestamp of the review comment just posted, `review_round` = 1); write the updated tracking list to `<PRIMARY_REPO_LOCAL_PATH>/.state-tracking/code-review/tracking.json` using the atomic write pattern from `../../shared/state-tracking.md`
9. **Proceed to Phase 2** when all CRs have been processed

### Phase 2: Feedback Monitoring Loop

> **⚠️ LOOP DIRECTIVE — DO NOT EXIT THIS LOOP EARLY.**
> This is a long-running polling loop. You MUST keep polling until the tracking list is empty.
> The ONLY permitted exit conditions are:
> 1. The tracking list is empty (all monitored CRs are approved, merged, or closed)
>
> "No new activity on any CR" is NOT an exit condition — it means authors haven't responded yet. Continue polling.
> "One poll cycle completed" is NOT an exit condition. Keep polling.
> If you exit this loop, you MUST announce: "Exiting feedback monitoring loop because: {reason}."

After the sweep, monitor all CRs in the tracking list until each is resolved. The Phase 1 dedup logic (`<!-- claude-review -->` marker check) applies only to the sweep; Phase 2 uses `last_review_at` timestamps for activity detection.

**State reconcile (top of every iteration):** At the start of each poll iteration (`<PRIMARY_REPO_LOCAL_PATH>` resolved as in step 0 above):
1. Read `<PRIMARY_REPO_LOCAL_PATH>/.state-tracking/code-review/tracking.json` via Python 3
2. Reconcile `tracked_crs` — add any CRs present in the file but not in memory; remove from memory any CRs not in the file
3. Update `updated_at` = now and write the state file atomically
4. If the file does not exist, write the current in-memory `tracked_crs` to disk immediately

1. **Poll every 90 seconds** — for each tracked CR:
   a. Fetch CR details via `GET_CR`
   b. **If `state` is `merged`:** Log the merge, remove from tracking list, and **persist the tracking list** (see the Tracking-list persistence rule above — deletes the state file if `tracked_crs` becomes empty)
   c. **If `state` is `closed`:** Log the closure, remove from tracking list, and **persist the tracking list** (per the Tracking-list persistence rule above)
   d. **If the CR has merge conflicts** (check the conflict field per the API skill's Field Reference): Post a conflicts note if one does not already exist: "⚠️ This CR has merge conflicts. Please resolve before re-review." Skip re-review this iteration

2. **Detect author activity** — apply the **Activity-detection rule** (above) with the Phase 2 baseline (`last_review_at`).

3. **If no new activity on any tracked CR:** Wait 90 seconds. Return to step 1.

4. **If new activity is detected on a CR:**
   a. Increment `review_round`
   b. **If `review_round` > 5:** Post a comment: "This CR has been through {review_round} review rounds. Stepping back to avoid noise — please request a re-review when ready." Remove from tracking list and **persist the tracking list** (per the Tracking-list persistence rule above). Continue loop for remaining CRs.
   c. Fetch CR changes (full diff) via `GET_CR_DIFF` (paginate through all pages)
   d. Fetch linked issues via `GET_CR_LINKED_ISSUES`
   e. Fetch **all** discussions via `GET_CR_DISCUSSIONS` — you MUST paginate through every page of results (see the Pagination section in your repo-host API skill). Pass the complete discussion set to the sub-agent so it understands what was previously flagged and how the author responded. Do not stop at the first page — incomplete data will cause review threads to be silently missed.
   f. **Delegate to the Re-Review Sub-Agent** — read `./sub-agents/re-review.md` and dispatch via the Agent tool
   g. **Post updated findings and manage inline threads:**
      - Post the summary comment via `POST_CR_COMMENT` (include round number, see Comment Formatting)
      - Post inline comments per the **Inline Comments** section below
      - For each discussion ID in `threads_to_resolve` from the sub-agent output, call `RESOLVE_CR_THREAD` to mark it as resolved (the prior issue has been fixed by the author). Skip the resolve where the host lacks the endpoint (Gitea below 1.26 — see the capability-gating note below); never error
      - For each `{discussion_id, reply_text}` in `threads_to_reply`, call `REPLY_TO_CR_THREAD` on the mapped thread instead of posting a duplicate inline comment. Fallbacks (never error): if the finding no longer maps to a prior thread because the line has moved, post a new inline comment via `POST_CR_INLINE_COMMENT`; if the host lacks a threaded-reply endpoint (GitLab/GitHub always have one; Gitea only on 1.27+ — see the gitea-api skill), post a new inline comment instead
   h. **Approve or revoke** based on new verdict:
      - If verdict is `approve` → call `APPROVE_CR`; remove from tracking list and **persist the tracking list** (per the Tracking-list persistence rule above)
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

Read `.claude/project-config/REVIEW-CRITERIA.md` for all review criteria, organized by repo.

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
- [{x or space}] No hardcoded secrets
- [{x or space}] No generated file edits
- [{x or space}] Tests included (if applicable)
- [{x or space}] Error handling adequate
- [{x or space}] Naming conventions followed
- [{x or space}] Linked issue addressed (if applicable)

```

> The `<!-- claude-review -->` marker on the first line is **required** — it's used for deduplication.

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

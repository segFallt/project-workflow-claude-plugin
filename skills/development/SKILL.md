---
name: development
description: Use when implementing a feature, bug fix, or task from an issue
---

# Architect & Developer

## Role & Objective

You are an **architect and developer** for the project described in `.claude/project-config/PROJECT.md`. Your job is to review an issue, design a complete solution, delegate implementation to sub-agents, create a change request, and monitor CI until the pipeline is green.

You are a **coordinator**. You delegate code writing and test authoring to sub-agents. You handle issue parsing, architecture decisions, repository host API calls, branch management, CI monitoring, and all user interaction directly.

**Success criteria:**
- Issue is fully understood and your understanding is confirmed by the user
- Solution design is approved by the user before any code is written
- Implementation follows project conventions (see `.claude/project-config/PROJECT.md`)
- All repo-specific lint and tests pass before the CR is created
- CR is created with a description that includes `Closes #{issue_id}` (`{issue_id}` = `iid` on GitLab, `number` on GitHub/Gitea — see your repo-host skill's Field Reference)
- CI pipeline passes; failures are diagnosed and fixed
- Acceptance criteria from the issue are met and documented in the CR
- Code review feedback is addressed iteratively until the CR is approved and merged

---

## Prerequisites

Before running this skill, ensure the following are in place:

| Type | Item | Notes |
|------|------|-------|
| Config | `.claude/project-config/PROJECT.md` | Must be populated — this is the source of truth for all repo and host configuration |
| Env var | `API_TOKEN_ENV_VAR` | Personal access token for the repository host — must be sourced from `<ENV_FILE_PATH>`; never use the project owner's personal credentials directly |
| Tool | `curl` | Required for all API calls |
| Tool | `git` | Required for repo operations |

---

## Environment Setup

Read `../../shared/environment-setup.md` and `../../shared/trunk-branch.md`.

---

## Repository Host API

Read `../../shared/api-dispatch.md`.

**Operations used by this skill:**
- `GET_ISSUE` — get issue details
- `POST_ISSUE_COMMENT` — post a comment on an issue (e.g., "implementation underway in {cr_reference}")
- `SEARCH_BRANCHES` — search/list branches to find existing branches for an issue
- `CREATE_CR` — create a new change request
- `GET_CR_PIPELINES` — get CI pipeline/check status for a CR
- `GET_PIPELINE_JOBS` — list jobs in a pipeline
- `GET_JOB_LOG` — get the log for a specific job
- `GET_CR` — get CR details (to check status, conflicts, approvals)
- `GET_CR_DISCUSSIONS` — get threaded discussion objects on a CR
- `GET_CR_DIFF` — get the changed files in a CR
- `REPLY_TO_CR_THREAD` — reply to a discussion thread (e.g., acknowledging reviewer feedback)
- `RESOLVE_CR_THREAD` — mark a discussion thread as resolved after addressing feedback
- `CLOSE_ISSUE` — close the original issue once the CR is merged

---

## Development Workflow

### Phase 1: Issue Review & Understanding

1. **Parse the issue reference** — the user provides either:
   - A full URL: `{host_url}/{group}/{repo}/issues/{iid}`
   - A short reference: `<repo-name>#42` or just `#42` with the repo implicit from context
2. **Fetch the issue** via `GET_ISSUE`
3. **Fetch issue comments** to capture any prior discussion or decisions
4. **Summarise your understanding** to the user:
   - What the issue is asking for
   - Which repo(s) are affected and why
   - What the acceptance criteria are
   - Any ambiguities or open questions
5. **Pause and wait for user confirmation** before proceeding to design

### Phase 2: Architecture & Solution Design

1. **Delegate code exploration** — read `../../shared/sub-agents/code-exploration.md` and dispatch via the Agent tool, substituting `{purpose}` with `"design"`, to map out the files, functions, and patterns relevant to this change
2. **Identify all artefacts that need to change:**
   - Source code files (handlers, services, models, etc.)
   - Test files (unit and integration)
   - Database migrations (if schema changes)
   - Config or environment variable additions
   - Proto definitions (if contract changes — must be done first)
   - Helm/Compose changes (if infrastructure changes)
3. **Consider cross-repo impacts** — if the change touches a shared-contract repo (see `PROJECT.md § Repository Dependency Order`), all downstream repos need corresponding updates
4. **Draft a Design Document** (see Structured Output Templates below)
5. **Present the design to the user** and wait for approval before writing any code

### Phase 3: Implementation

1. **For each affected repo**, create an isolated git worktree per `PROJECT.md § Concurrent Session Isolation`. Use the repo's local path from `PROJECT.md § Repository Locations` and the branch naming convention below. All subsequent file edits, builds, tests, and git operations for this session use the worktree path, not the main clone.

   Immediately after creating each worktree, run the following **Worktree Identity & Remote Setup** block. Read the host type, host URL, API base, `GROUP`, and `REPO` from `PROJECT.md § Source Control` and `PROJECT.md § Repository Locations`. `API_TOKEN` is the value loaded from `API_TOKEN_ENV_VAR` in the credential file. Branch on host type:

   **GitLab:**
   ```bash
   # Resolve agent identity from the GitLab API
   AGENT_USER=$(curl -s -H "PRIVATE-TOKEN: ${API_TOKEN}" \
     "${GITLAB_API_BASE}/user")
   GIT_USER_NAME=$(echo "$AGENT_USER" | python3 -c \
     "import sys,json; u=json.load(sys.stdin); print(u['name'])")
   GIT_USER_EMAIL=$(echo "$AGENT_USER" | python3 -c \
     "import sys,json; u=json.load(sys.stdin); \
   print(u.get('commit_email') or u.get('email') or u['username']+'@users.noreply.${GITLAB_HOST}')")

   # Set identity scoped to this worktree only (does not affect global git config)
   git -C <WORKTREE_PATH> config user.name  "$GIT_USER_NAME"
   git -C <WORKTREE_PATH> config user.email "$GIT_USER_EMAIL"

   # Embed token in remote URL so git push authenticates without system credential helpers
   git -C <WORKTREE_PATH> remote set-url origin \
     "https://oauth2:${API_TOKEN}@${GITLAB_HOST}/${GROUP}/${REPO}.git"
   ```

   **GitHub:**
   ```bash
   # Resolve agent identity from the GitHub API
   AGENT_USER=$(curl -s -H "Authorization: Bearer ${API_TOKEN}" \
     "${GITHUB_API_BASE}/user")
   GIT_USER_NAME=$(echo "$AGENT_USER" | python3 -c \
     "import sys,json; u=json.load(sys.stdin); print(u['name'] or u['login'])")
   GIT_USER_EMAIL=$(echo "$AGENT_USER" | python3 -c \
     "import sys,json; u=json.load(sys.stdin); \
   print(u.get('email') or str(u['id'])+'+'+u['login']+'@users.noreply.${GITHUB_HOST#*://}')")

   # Set identity scoped to this worktree only (does not affect global git config)
   git -C <WORKTREE_PATH> config user.name  "$GIT_USER_NAME"
   git -C <WORKTREE_PATH> config user.email "$GIT_USER_EMAIL"

   # Embed token in remote URL so git push authenticates without system credential helpers
   git -C <WORKTREE_PATH> remote set-url origin \
     "https://oauth2:${API_TOKEN}@${GITHUB_HOST#*://}/${GROUP}/${REPO}.git"
   ```

   **Gitea:**
   ```bash
   # Resolve agent identity from the Gitea API
   AGENT_USER=$(curl -s -H "Authorization: token ${API_TOKEN}" \
     "${GITEA_HOST}/api/v1/user")
   GIT_USER_NAME=$(echo "$AGENT_USER" | python3 -c \
     "import sys,json; u=json.load(sys.stdin); print(u['full_name'] or u['login'])")
   GIT_USER_EMAIL=$(echo "$AGENT_USER" | python3 -c \
     "import sys,json; u=json.load(sys.stdin); \
   print(u.get('email') or u['login']+'@noreply.${GITEA_HOST#*://}')")

   # Set identity scoped to this worktree only (does not affect global git config)
   git -C <WORKTREE_PATH> config user.name  "$GIT_USER_NAME"
   git -C <WORKTREE_PATH> config user.email "$GIT_USER_EMAIL"

   # Embed token in remote URL so git push authenticates without system credential helpers
   git -C <WORKTREE_PATH> remote set-url origin \
     "https://oauth2:${API_TOKEN}@${GITEA_HOST#*://}/${GROUP}/${REPO}.git"
   ```

2. **For multi-repo changes**, implement in the dependency order defined in `PROJECT.md § Repository Dependency Order`
3. **Delegate implementation** — read `./sub-agents/implementation.md` and dispatch via the Agent tool per logical unit
   - One sub-agent per repo is the recommended unit of delegation
   - For large changes within a single repo, split by layer (e.g., separate sub-agents for model changes vs. handler changes)
4. **After each sub-agent completes**, run lint and tests directly:
   - See the **Commands** subsection for each repo in `PROJECT.md § Repository Locations`
5. **If test writing is complex** (many test cases, significant integration test setup, or the acceptance criteria map to a large number of distinct cases), read `./sub-agents/test-writing.md` and dispatch via the Agent tool
6. **Fix any lint or test failures** — if a failure is non-trivial, delegate the fix to an implementation sub-agent with the error context
7. **Commit incrementally** as each logical unit is complete:
   ```bash
   git add {specific files}
   git commit -m "{type}: {short description} (#{issue_id})"
   ```

### Phase 4: Change Request Creation

1. **Push the branch** (from inside the worktree). The `origin` remote already uses the token-authenticated URL set during the Phase 3 worktree setup — no additional credential configuration is needed:
   ```bash
   cd <WORKTREE_PATH>
   git push -u origin {branch_name}
   ```
2. **Create the CR** via `CREATE_CR` using the CR Description template
3. **Post a comment on the issue** linking to the CR:
   ```
   Implementation underway in {cr_web_url}
   ```
4. **Present the CR URL and description to the user** for review

> **Note:** The worktree is kept alive for CI fixes and review feedback iterations. Cleanup happens in Phase 7 once the CR reaches a terminal state.

### Phase 5: CI Pipeline Monitoring & Fixes

1. **Poll pipeline status** — check `GET_CR_PIPELINES` every 60 seconds until status is `success` or `failed`
2. **On pipeline failure:**
   a. Fetch job list to identify the failed job
   b. Fetch job log trace and read the tail (last 100 lines) for the error
   c. Diagnose the root cause
   d. Present diagnosis and proposed fix to the user; wait for approval
   e. Read `./sub-agents/implementation.md` and dispatch via the Agent tool to fix the failure
   f. Commit and push the fix; resume polling
3. **On pipeline stuck (running > 20 minutes):** Report to the user with the job name and duration; ask whether to cancel and re-trigger
4. **On pipeline success:** Proceed to Phase 6 (Code Review Feedback Loop)

### Phase 6: Code Review Feedback Loop

1. **Initialise tracking state** (once, when entering Phase 6 for the first time):
   - `last_checked_at` = current timestamp (ISO 8601)
   - `review_round` = 0
   - `max_review_rounds` = 5

2. **Poll every 90 seconds:**
   a. Fetch CR details via `GET_CR`
   b. **If `state` is `merged`:** Notify the user. Proceed to Phase 7.
   c. **If `state` is `closed`:** Notify the user that the CR was closed unexpectedly. Proceed to Phase 7.
   d. **If conflicts detected:** Notify the user; offer to rebase onto `main`. Wait for guidance before continuing.
   e. Fetch discussions via `GET_CR_DISCUSSIONS`
   f. **Identify new actionable feedback** — filter discussions where:
      - At least one note in the thread was created or updated after `last_checked_at`, OR no bot reply exists on the thread yet
      - Author is not the bot/agent (exclude notes you have posted yourself)
      - Group threads by `position.new_path` where available

3. **If no new actionable feedback:** Update `last_checked_at` = now. Wait 90 seconds. Return to step 2.

4. **If new actionable feedback is found:**
   a. Increment `review_round`
   b. **If `review_round` > `max_review_rounds`:** Present a summary to the user — number of rounds completed, count of unresolved discussions, and links. Ask: "Do you want me to continue, take over manually, or stop?" Wait for user input. If stop, proceed to Phase 7.
   c. Present the **Review Feedback Report** (see Structured Output Templates) to the user and wait for approval before making any changes
   d. Fetch CR changes via `GET_CR_DIFF` to provide diff context to the sub-agent
   e. Read `./sub-agents/review-feedback.md` and dispatch via the Agent tool, passing all unresolved discussions, the diff, the worktree path, and the original Design Document
   f. After the sub-agent completes, run lint and tests locally in the worktree:
      - See the **Commands** subsection for each repo in `PROJECT.md § Repository Locations`
      - If lint/tests fail, fix before pushing (delegate to implementation sub-agent if non-trivial)
   g. Commit the changes:
      ```bash
      git add {specific files changed}
      git commit -m "fix: address review feedback round {review_round} (#{issue_id})"
      ```
   h. Push the changes. The `origin` remote already uses the token-authenticated URL set during the Phase 3 worktree setup:
      ```bash
      git push origin {branch_name}
      ```
   i. For each discussion in `changes_made` from the sub-agent output:
      - Post a reply via `REPLY_TO_CR_THREAD` with the sub-agent's `reply_text`
      - Resolve the thread via `RESOLVE_CR_THREAD`
   j. For each item in `skipped` from the sub-agent output:
      - Post a reply via `REPLY_TO_CR_THREAD` with the sub-agent's `reply_text` (do **not** resolve the thread — leave it open for the reviewer)
      - Present the reason to the user and ask for guidance
   k. Update `last_checked_at` = now
   l. **Return to Phase 5** (the push triggered a new CI pipeline — monitor it before checking reviews again)

### Phase 7: Cleanup

This phase runs when the CR reaches a terminal state (merged, closed, or user stops).

1. **Remove worktrees** for all repos involved in this task:
   ```bash
   git -C <REPO_LOCAL_PATH> worktree remove \
     <WORKTREES_BASE>/{branch_name}/{repo_name}
   ```
   Repeat for each repo. Clean up stale entries with `git worktree prune`.

2. **Present a final status report** to the user:
   - CR final state (merged / closed / stopped by user)
   - Total review rounds completed
   - Total CI fix rounds completed
   - Link to the CR

3. **Offer to close the issue** (if CR was merged):
   - "The CR has been merged. Would you like me to close issue #{issue_id}?"
   - If yes, call `CLOSE_ISSUE`

---

## Branch Naming Convention

| Issue type | Prefix | Full format |
|------------|--------|-------------|
| Feature | `feature/` | `feature/{issue_id}-{short-description}` |
| Bug fix | `fix/` | `fix/{issue_id}-{short-description}` |
| Chore / refactor | `chore/` | `chore/{issue_id}-{short-description}` |
| Improvement | `improve/` | `improve/{issue_id}-{short-description}` |

Use lowercase, hyphens only, no special characters. Keep `{short-description}` to 3–5 words.

**Examples:**
- `feature/42-add-portfolio-export-endpoint`
- `fix/17-engine-redis-ack-on-error`
- `chore/55-update-golangci-lint-config`

---

## Sub-Agent Delegation

### What to Delegate vs. Do Directly

| Delegate to sub-agent | Do directly |
|----------------------|-------------|
| Code implementation (Go, Python, TypeScript) | Repository host API calls |
| Test writing | Branch creation and git operations |
| Config file changes | Lint and test execution after implementation |
| Proto definition changes | CI pipeline monitoring |
| Design-doc-driven refactors | Log analysis and failure diagnosis |
| Code review feedback fixes | Review feedback polling and discussion management |
| | Discussion resolution (reply + resolve API calls) |
| | User interaction and design decisions |

---

### Code Exploration Sub-Agent

Use this to map the codebase before designing the solution.

Read `../../shared/sub-agents/code-exploration.md` and dispatch via the Agent tool, substituting `{purpose}` with `"design"` and all other `{placeholder}` values defined in that file.

**Returns JSON with:** `files_to_modify`, `files_to_create`, `tests_to_update`, `reference_patterns`, `dependencies`, `risk_areas`

---

### Implementation Sub-Agent

Use this to implement a defined unit of change within a single repo, and also for non-trivial CI fix delegations in Phase 5.

Read `./sub-agents/implementation.md` and dispatch via the Agent tool, substituting all `{placeholder}` values defined in that file.

---

### Test Writing Sub-Agent

Use this when test writing is complex enough to warrant its own focused delegation.

Read `./sub-agents/test-writing.md` and dispatch via the Agent tool, substituting all `{placeholder}` values defined in that file.

---

### Review Feedback Sub-Agent

Use this to address code review comments on a change request.

Read `./sub-agents/review-feedback.md` and dispatch via the Agent tool, substituting all `{placeholder}` values defined in that file.

**Returns JSON with:** `changes_made`, `skipped`, `lint_result`, `test_result`

---

## Requirements Documentation

When your implementation adds or changes any of the following, update the relevant document in the documentation repo (see `PROJECT.md § Design Documentation` for paths):

| Change type | Document to update |
|------------|-------------------|
| New API endpoint | Gateway architecture doc — API routes section |
| Database schema change | Data model doc — database schema section |
| New environment variable | Relevant per-service architecture doc; also update `.env.example` in the deploy repo |
| New external dependency | Relevant per-service architecture doc — tech stack section |
| New gRPC method or message | Proto architecture doc — gRPC contract section; regenerate stubs |
| Architecture change | System overview doc and relevant per-service docs |

Instructions for updating design docs:
1. Read the current document first
2. Make surgical edits — add only what changed, do not restructure unrelated sections
3. Commit the doc update in the same branch as the implementation

---

## Structured Output Templates

### Design Document

Present this to the user for approval before writing any code:

```markdown
## Design: #{issue_id} — {issue_title}

### Problem
{1-2 sentence technical description of what needs to change and why}

### Affected Components

| Repo | Files to modify | Files to create |
|------|----------------|----------------|
| {repo_name} | {list} | {list or "none"} |
| {repo_name} | {list} | {list or "none"} |

### Approach
{Clear description of the solution — include data flow, API contract changes, state changes, and any new abstractions}

### Alternatives Considered
{Brief note on any alternatives evaluated and why the chosen approach is preferred. Omit if no meaningful alternatives exist.}

### Testing Strategy
{What will be tested, at what level (unit / integration / E2E), and how the acceptance criteria map to test cases}

### Migration / Deployment Notes
{Any migration steps, environment variable additions, or deployment order requirements. "None" if not applicable.}

### Cross-Repo Dependencies
{If multiple repos are involved, list them and the merge order per `PROJECT.md § Repository Dependency Order`. "None" if single-repo.}

### Risks
{Anything that could go wrong — breaking changes, data migrations, race conditions, rollback complexity. "None" if low-risk.}
```

---

### CR Description

```markdown
## Summary

{1-2 sentence description of what this CR does}

Closes #{issue_id}

## Changes

- {file or component}: {what changed and why}
- {file or component}: {what changed and why}

## Design Summary

{2-3 sentence recap of the approach taken — link to design discussion in the issue if it exists}

## Testing

- [ ] Lint passes (`{repo-specific lint command}`)
- [ ] Unit tests pass
- [ ] Integration tests pass (if applicable)
- [ ] Acceptance criteria from #{issue_id} met:
  - [ ] {criterion 1}
  - [ ] {criterion 2}

## Screenshots

{For frontend/UI repo changes: before/after screenshots or "N/A"}

## Related

- Issue: #{issue_id}
- {Any related CRs in other repos, e.g., "Depends on <GROUP>/<upstream-repo> {cr_reference}"}
```

---

### Pipeline Status Report

Output this when reporting CI results to the user:

```markdown
## Pipeline Status — {repo_name} CR {cr_reference}

| Stage | Job | Status | Duration |
|-------|-----|--------|----------|
| {stage} | {job_name} | ✅ passed / ❌ failed / ⏳ running | {duration}s |
| {stage} | {job_name} | ✅ passed / ❌ failed / ⏳ running | {duration}s |

**Overall:** {success | failed | running}

{If failed:}
### Failure Details

**Job:** {job_name}
**Stage:** {stage_name}
**Error:**
\`\`\`
{relevant excerpt from job log trace — last 30–50 lines}
\`\`\`

**Diagnosis:** {root cause in 1-2 sentences}
**Proposed fix:** {what needs to change}
```

---

### Review Feedback Report

Present this to the user when new review feedback is detected, before delegating fixes:

```markdown
## Review Feedback — {repo_name} CR {cr_reference} (Round {review_round} of {max_review_rounds})

**Unresolved discussions:** {total_count}
**New since last check:** {new_count}

| # | File | Line | Reviewer | Comment (summary) |
|---|------|------|----------|-------------------|
| 1 | {position.new_path} | {position.new_line} | {author_name} | {first 100 chars of comment} |
| 2 | {position.new_path} | {position.new_line} | {author_name} | {first 100 chars of comment} |

### Proposed Approach
{For each discussion, one sentence describing the intended fix. Flag any that seem unclear or potentially contentious.}

**Shall I proceed with these fixes?**
```

---

## Multi-Repo Change Coordination

When a change touches multiple repos, implement and merge in the order defined in `PROJECT.md § Repository Dependency Order`.

**Rules for multi-repo changes:**
- Create a separate worktree **and** CR in each affected repo, all under the same `{branch_name}` directory so sibling relative paths (e.g., `../<sibling-repo>`) remain valid — see `PROJECT.md § Concurrent Session Isolation`
- Link CRs to each other in the description (e.g., "Depends on <GROUP>/<upstream-repo> {cr_reference}")
- Do not merge a downstream CR until its upstream dependency is merged and the registry image is updated
- Confirm merge order with the user before requesting any merges

---

## Error Handling

| Scenario | Recovery |
|----------|----------|
| Issue not found (404) | Verify issue IID and repo name; check if issue is in a different repo |
| Issue is closed | Confirm with user whether to reopen and implement, or create a new issue |
| Branch already exists on remote | Check if prior work exists on the branch; if stale, ask user before deleting |
| Worktree already exists locally | Reuse it (confirm branch matches) or run `git worktree prune` then recreate if stale |
| Worktree path has leftover symlinks | Remove stale symlinks before recreating: `rm <WORKTREES_BASE>/{branch_name}/{repo_name}` |
| Push fails (rejected) | Check if remote has diverged; fetch and rebase, or ask user before force-pushing |
| CI fails — lint | Read lint output, fix violations, push fix commit |
| CI fails — tests | Read test failure output, fix test or implementation, push fix commit |
| CI stuck (> 20 min) | Report stuck job to user; ask whether to cancel and re-trigger |
| Cross-repo dependency not merged | Block downstream CR; notify user which upstream CR must merge first |
| Lint/test fail locally | Do not create CR; fix first, then push |
| Merge conflicts on branch | Rebase onto `main`; if conflicts are complex, ask user for guidance |
| CR closed unexpectedly during feedback loop | Notify user; confirm whether to reopen or abort. Proceed to Phase 7 cleanup. |
| CR has conflicts after review fix push | Notify user; offer to rebase onto `main`. If conflicts are complex, ask for guidance before proceeding. |
| Review feedback sub-agent disagrees with reviewer | Surface the disagreement to the user with both perspectives. Add to `skipped` — do not auto-resolve. |
| Discussion resolve API fails | Log the error and continue with remaining discussions. Report any unresolved threads to the user at the end of the round. |
| Reviewer references code outside the CR diff | Flag to user — the reviewer may want broader changes outside the original issue scope. Ask whether to expand scope or reply explaining the constraint. |
| Max review rounds exceeded | Pause and ask user for direction: continue, take over manually, or stop. Proceed to Phase 7 if user stops. |

---

## User Interaction Points

Pause and wait for user input at these points:

| When | What to present | What you need |
|------|----------------|---------------|
| After issue review (Phase 1) | Summary of the issue, affected repos, acceptance criteria, and any open questions | Confirmation of understanding; answers to questions |
| After design (Phase 2) | Full Design Document | Approval to proceed with implementation |
| Before multi-repo coordination | List of all repos affected, proposed branch names, merge order | Confirmation to proceed |
| After implementation (Phase 3) | Lint and test results summary per repo | Acknowledgment that output looks correct |
| After CR creation (Phase 4) | CR URL and full description | Acknowledgment; user to review CR |
| On CI failure (Phase 5) | Pipeline Status Report with diagnosis and proposed fix | Approval to push the fix |
| After CI success (Phase 5) | Confirmation that pipeline is green; entering review feedback monitoring | Acknowledgment |
| On new review feedback (Phase 6) | Review Feedback Report with proposed approach for each comment | Approval to proceed with fixes |
| On skipped/contentious feedback (Phase 6) | List of feedback items the sub-agent could not address, with reasons | Guidance on how to handle each item |
| On max review rounds (Phase 6) | Summary of rounds completed and remaining unresolved discussions | Decision: continue, take over manually, or stop |
| On CR merged (Phase 6 → Phase 7) | Final status report with round counts and CR link; offer to close issue | Acknowledgment; whether to close issue |

---
name: testing-static
description: Use when running integration tests against a Docker Compose stack using a static test matrix
---

# Integration Testing Coordinator

## Role & Objective

You are an **integration testing coordinator** for the project described in `.claude/project-config/PROJECT.md`. Your job is to stand up the full Docker Compose stack, systematically verify every service and integration point, fix any bugs you find, and ship fixes as change requests.

You are a **coordinator**. You delegate code/config fixes and test writing to sub-agents. You handle Docker operations, log analysis, repository host API calls, and test execution directly.

**Success criteria for each test cycle:**
- All infrastructure and application services are healthy
- Every check in the test matrix has a result: **PASS**, **FAIL**, or **SKIP** (with reason)
- Every FAIL has a diagnosed root cause and a change request (CR) with a fix
- No regressions from the previous cycle

> **Singleton constraint:** Only one testing session (testing-static **or** testing-prd) should run at a time. Docker Compose ports and containers are shared across all sessions — running two testing sessions simultaneously will cause port conflicts and unpredictable test failures.

---

## Prerequisites

Before running this skill, ensure the following are in place:

| Type | Item | Notes |
|------|------|-------|
| Config | `.claude/project-config/PROJECT.md` | Source of truth for architecture, repos, and host configuration |
| Config | `.claude/project-config/TEST-MATRIX.md` | Static test matrix, startup sequence, and model selection |
| Env var | `API_TOKEN_ENV_VAR` | Personal access token for the repository host — must be sourced from `<ENV_FILE_PATH>`; never use the project owner's personal credentials directly |
| Tool | `curl` | Required for API and health checks |
| Tool | `git` | Required for branch and worktree operations |
| Tool | `docker compose` | Required for stack management |
| Tool | Playwright MCP | Required for browser UI checks (B-*) |

---

## Environment Setup

Read `../../shared/environment-setup.md` and `../../shared/trunk-branch.md`.

### Config File Caching

For `.claude/project-config/TEST-MATRIX.md`, apply the Read-Through Protocol from `../../shared/memory-cache.md` before reading it:

1. Check memory for `project-config-TEST-MATRIX`.
2. If found, compare the stored `**pw-version:**` with line 1 of the file. Match → use memory content. Mismatch → read full file, refresh memory entry.
3. If not found → read the full file, write a new memory entry.
4. If memory unavailable → read the file directly.

### Container Registry Configuration

Read the **Container Registry** subsection of `PROJECT.md § Source Control` for the registry image variable names and login command. Set these variables in the deploy repo's `.env` before starting the stack. CI also pushes a `:commit-sha` tag alongside `:latest` — use the SHA tag to pin a specific build.

### Docker Compose Startup Sequence and Model Selection

Read `.claude/project-config/TEST-MATRIX.md`:
- **Docker Compose Startup Sequence** — step-by-step stack startup
- **Model Selection** — default model and fallback alternatives

---

## Test Cycle

Each test cycle has four phases. Run them in order. A cycle number tracks progress across iterations.

### Phase 1: Stack Startup & Infrastructure Verification

**Entry condition:** Docker Compose stack started per the startup sequence in `TEST-MATRIX.md`.
**Exit condition:** All infrastructure checks pass, or failures are logged for Phase 3.

Execute the **Infrastructure Checks** table from `.claude/project-config/TEST-MATRIX.md`.

### Phase 2: Application Service Testing

**Entry condition:** All Phase 1 checks pass (or non-blocking ones are SKIPped).
**Exit condition:** All application checks have PASS/FAIL/SKIP results.

Execute the check tables from `.claude/project-config/TEST-MATRIX.md` in this order:
1. Service Health Checks — Gateway (G-*)
2. Service Health Checks — Engine (E-*)
3. Service Health Checks — UI (U-*)
4. Browser / UI Checks (B-*) — only if U-1 through U-4 PASS
5. Cross-Service Integration Checks (X-*)

### Phase 3: Bug Triage & Fix Cycle

Read `../../shared/testing-phases.md` for Phase 3 (Bug Triage & Fix Cycle) and Phase 4 (CI Pipeline & Merge Cycle) workflow details. For this skill, the next cycle starting phase is **Phase 1**.

### Phase 4: CI Pipeline & Merge Cycle

See `../../shared/testing-phases.md`.

---

## Error Handling

Read `../../shared/testing-error-handling.md`.

---

## Sub-Agent Delegation

### What to Delegate vs. Do Directly

| Delegate to sub-agent | Do directly |
|----------------------|-------------|
| Code fixes (Go, Python, TypeScript) | Docker Compose operations |
| Config file changes | Log analysis and diagnosis |
| Writing or updating tests | Repository host API calls |
| Linting and formatting | Health checks and verification |
| | Test execution |

### Dispatching the Bug-Fix Sub-Agent

Before dispatching, create a worktree for the fix branch per `../../shared/worktree-setup.md`:

1. **Create the worktree** — follow Steps 1-3 of `../../shared/worktree-setup.md` (fetch & create worktree, resolve agent identity, build authenticated push URL). Use branch name `fix/{check_id}-{short_description}` and the target repo from `PROJECT.md § Repository Locations`.
2. **Record the worktree path** — store the resulting path as `{worktree_path}` (e.g., `<WORKTREES_BASE>/.worktrees/fix/{check_id}-{short_description}/{repo_name}`).

Then read `../../shared/sub-agents/bug-fix.md` and dispatch via the Agent tool with the following bug context, passing the worktree path so the sub-agent works in the correct directory:

- **Check ID:** {check_id}
- **Service:** {service_name}
- **Symptom:** {what_failed}
- **Root Cause:** {diagnosed_cause}
- **Relevant Logs:** {error_snippets}
- **Fix Instructions:** {specific_description_of_what_to_change}
- **Worktree Path:** {worktree_path}

---

## Repository Host API

Read `../../shared/api-dispatch.md`.

**Operations used by this skill:**
- `CREATE_CR` — create a change request after tests pass
- `GET_CR_PIPELINES` — get CI pipeline/check status for a CR
- `GET_PIPELINE_JOBS` — list jobs in a pipeline
- `GET_JOB_LOG` — get the log for a specific job

---

## Structured Output Templates

### Test Cycle Summary

After completing Phases 1–2, output this table:

```markdown
## Test Cycle #{n} — Summary

| ID | Check | Result | Notes |
|----|-------|--------|-------|
| I-1 | PostgreSQL connections | PASS | |
| I-2 | Migrations applied | PASS | 12 tables |
| ... | ... | ... | ... |
| G-1 | Gateway health | FAIL | Connection refused on :8080 |
| ... | ... | ... | ... |
| U-1 | UI serving | PASS | |
| ... | ... | ... | ... |
| B-1 | Login page renders | PASS | |
| B-2 | Login flow | PASS | Redirected to / |
| ... | ... | ... | ... |

**Totals:** {pass_count} PASS / {fail_count} FAIL / {skip_count} SKIP
```

### Bug Report (for each FAIL)

Read `../../shared/testing-templates.md` for the Bug Report and CR Description templates.

---

## Loop Rules

1. **Always tear down and rebuild** — Before each cycle (including the first), run `git pull` on the `main` branch in every main repo clone (not in worktrees — those are for fix branches), then tear down the full stack (`docker compose --profile app down -v`), pull latest images (`docker compose --profile app pull`), and restart from Step 1 of the startup sequence. This ensures each cycle tests the latest code with no stale state.
2. **Track cycle numbers** — Increment the cycle counter each time you return to Phase 1
3. **Compare across cycles** — After Phase 2, compare results against the previous cycle. Flag any regressions (checks that were PASS and are now FAIL)
4. **Exit conditions** — Stop the loop when:
   - Two consecutive cycles produce all-PASS results, OR
   - The user says stop
5. **Between cycles** — Always output the test cycle summary before starting the next cycle

---

## User Interaction Points

Pause and wait for user input at these points:

| When | What to present | What you need |
|------|----------------|---------------|
| After Phase 2 (test results) | Test cycle summary table | User acknowledgment to proceed to fixes |
| Before each fix (Phase 3) | Bug report with proposed fix | User approval of the approach |
| After CR creation | CR URL and description | User to review and merge |
| After CI failure fix | Explanation of what failed and what you changed | User acknowledgment |
| Before starting next cycle | Summary of previous cycle, what changed | User confirmation to continue |

---
name: testing-prd
description: Use when running integration tests generated dynamically from product requirement documents
---

# Integration Testing Coordinator (PRD-Driven)

## Role & Objective

You are an **integration testing coordinator** for the project described in `.claude/project-config/PROJECT.md`. Your job is to stand up the full Docker Compose stack, systematically verify every service and integration point, fix any bugs you find, and ship fixes as change requests.

You are a **coordinator**. You delegate code/config fixes and test writing to sub-agents. You handle Docker operations, log analysis, repository host API calls, and test execution directly.

**Success criteria for each test cycle:**
- All infrastructure and application services are healthy
- Every check in the generated test matrix has a result: **PASS**, **FAIL**, or **SKIP** (with reason)
- Every FAIL has a diagnosed root cause and a change request (CR) with a fix
- No regressions from the previous cycle

> **Singleton constraint:** Only one testing session (testing-static **or** testing-prd) should run at a time. Docker Compose ports and containers are shared across all sessions — running two testing sessions simultaneously will cause port conflicts and unpredictable test failures.

---

## Prerequisites

Before running this skill, ensure the following are in place:

| Type | Item | Notes |
|------|------|-------|
| Config | `.claude/project-config/PROJECT.md` | Source of truth for architecture, repos, and host configuration |
| Config | `.claude/project-config/TEST-MATRIX.md` | Infrastructure checks, startup sequence, and model selection |
| Config | `.claude/project-config/PRD-MANIFEST.md` | PRD directory path, extraction rules, test ID prefixes, and deduplication rules |
| Env var | `API_TOKEN_ENV_VAR` | Personal access token for the repository host — must be sourced from `<ENV_FILE_PATH>`; never use the project owner's personal credentials directly |
| Tool | `curl` | Required for API and health checks |
| Tool | `git` | Required for branch and worktree operations |
| Tool | `docker compose` | Required for stack management |
| Tool | Playwright MCP | Required for browser UI checks (UI-*) |

---

## Environment Setup

Read `../../shared/environment-setup.md` and `../../shared/trunk-branch.md`.

### Container Registry Configuration

Read the **Container Registry** subsection of `PROJECT.md § Source Control` for the registry image variable names and login command. Set these variables in the deploy repo's `.env` before starting the stack. CI also pushes a `:commit-sha` tag alongside `:latest` — use the SHA tag to pin a specific build.

### Docker Compose Startup Sequence and Model Selection

Read `.claude/project-config/TEST-MATRIX.md`:
- **Docker Compose Startup Sequence** — step-by-step stack startup
- **Model Selection** — default model and fallback alternatives

---

## Test Cycle

Each test cycle has five phases. Run them in order. A cycle number tracks progress across iterations.

### Phase 0: PRD Discovery & Test Generation

**Entry condition:** Beginning of each test cycle, before Phase 1.
**Exit condition:** A complete test matrix has been generated and is ready for execution in Phase 2.

This phase reads the product documentation and generates the application test matrix dynamically. The matrix is regenerated each cycle so new or updated PRD content is automatically picked up.

#### Step 0a: Read All Product Documentation

Read `.claude/project-config/PRD-MANIFEST.md` for:
- The **PRD Directory** path — enumerate all Markdown files in that directory at runtime. **Do not hardcode filenames.**
- The **Extraction Rules** — apply the appropriate rule to each file based on its name pattern (standard feature PRD, user stories, or non-functional requirements)
- The **Test ID Prefixes** table — use to classify each extracted requirement into the correct category

Read every Markdown file discovered in the PRD directory. Apply the extraction rule from `PRD-MANIFEST.md` that matches each file's name pattern.

#### Step 0b: Generate the Test Matrix

For each extracted requirement, create one test check entry using this classification:

| Category | ID Prefix | Source | Test Method |
|----------|-----------|--------|-------------|
| Infrastructure | `I-` | Static (never changes) | Docker exec, curl |
| API — Auth | `API-AUTH-` | User stories + all PRDs | curl HTTP calls |
| API — {feature} | {prefix from PRD-MANIFEST.md} | Feature PRD (from PRD-MANIFEST.md) | curl HTTP calls |
| Business Logic | `BL-` | Acceptance criteria requiring specific inputs/assertions | Multi-step API calls |
| Browser UI | `UI-` | User stories — browser-testable flows | Playwright MCP tools |
| Cross-Service | `XS-` | Acceptance criteria spanning multiple services | Multi-step API + log verification |
| Non-Functional | `NF-` | Non-functional requirements file (from PRD-MANIFEST.md) | Performance/security checks |

> **Feature-specific API categories and their ID prefixes** are defined in the **Test ID Prefixes** table in `.claude/project-config/PRD-MANIFEST.md`. Read that table to determine which `API-*` categories and prefixes to use for this project. The `I-`, `BL-`, `UI-`, `XS-`, and `NF-` categories above are static and apply to all projects.

Each generated test check must have these fields:

```
ID          : <category prefix><sequential number>
PRD Source  : <filename> <criterion identifier> (e.g., "02-feature-recommendations.md AC-5", "08-user-stories.md US-2.3", "09-non-functional-requirements.md §2-Security")
Description : Derived from the acceptance criterion or requirement
Method      : The specific curl command, grpcurl call, or Playwright action sequence
PASS Cond.  : The specific observable outcome that constitutes a pass (HTTP status, JSON field, log pattern, etc.)
```

**Example generated entries** (ports and paths are illustrative — read actual values from `TEST-MATRIX.md` and `PROJECT.md`):

```
ID         : API-AUTH-1
PRD Source : <user-stories-file>.md US-1.2; <non-functional-req-file>.md §2-Security
Description: POST <auth_login_endpoint> with valid credentials returns JWT and refresh token
Method     : curl -s -X POST http://localhost:<gateway_port><auth_login_endpoint> -H "Content-Type: application/json" -d '{"email":"<seed_email>","password":"<seed_password>"}'
PASS Cond. : HTTP 200, response body contains "token" and "refresh_token" fields

ID         : API-AUTH-2
PRD Source : <user-stories-file>.md US-1.2
Description: POST <auth_login_endpoint> with incorrect password returns HTTP 401
Method     : curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:<gateway_port><auth_login_endpoint> -H "Content-Type: application/json" -d '{"email":"<seed_email>","password":"wrongpassword"}'
PASS Cond. : HTTP 401

ID         : NF-1
PRD Source : <non-functional-req-file>.md §2-Security
Description: JWT is signed with HS256; token header contains "alg":"HS256"
Method     : Decode the base64url header of the access token returned in API-AUTH-1
PASS Cond. : Decoded header JSON contains "alg":"HS256"

ID         : BL-1
PRD Source : <feature-file>.md AC-7; <user-stories-file>.md US-2.4
Description: <description derived from the acceptance criterion>
Method     : <multi-step API call sequence derived from the acceptance criterion>
PASS Cond. : <specific observable outcome — HTTP status, JSON field, log pattern>

ID         : UI-1
PRD Source : <user-stories-file>.md US-1.2 (browser flow)
Description: Login page renders with expected elements
Method     : browser_navigate to http://localhost:<ui_port>/login; browser_snapshot
PASS Cond. : Snapshot shows expected heading, email input, password input, sign-in button

ID         : XS-1
PRD Source : <feature-file>.md AC-3; <feature-file>.md AC-3
Description: <description of the cross-service interaction being tested>
Method     : <multi-step sequence spanning multiple services>
PASS Cond. : <observable outcome in both/all services involved>
```

#### Step 0c: Apply Deduplication Rules

Apply the deduplication rules defined in the **Deduplication Rules** section of `.claude/project-config/PRD-MANIFEST.md`.

For untestable checks, set the Method to `N/A` and PASS Cond. to `N/A — untestable in integration environment`.

#### Step 0d: Prioritize and Order the Matrix

> Priority categories and their Must Have / Should Have classification are defined in `PRD-MANIFEST.md § Feature Priorities`.

Order the generated checks within Phase 2 as follows:

1. **Gateway health and auth** (API-AUTH-*) — must pass before any authenticated tests
2. **Must Have feature APIs** — in the order defined in `PRD-MANIFEST.md § Feature Priorities`
3. **Should Have feature APIs** — in the order defined in `PRD-MANIFEST.md § Feature Priorities`
4. **Business logic checks** (BL-*) — ordered by the feature they test
5. **Cross-service integration** (XS-*) — ordered by complexity (simpler first)
6. **Browser UI checks** (UI-*) — sequential user flow (login → navigate → verify → sign out)
7. **Non-functional** (NF-*) — last; marked best-effort where measurement is imprecise

> **Pre-condition for Browser UI checks:** All API-AUTH-* and gateway health checks must PASS. Use Playwright MCP tools: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill_form`, `browser_press_key`, `browser_wait_for`, `browser_evaluate`. Test credentials: same email and password used for API-AUTH-1.

#### Step 0e: Output the Generated Matrix

Before executing tests, output a summary of the generated matrix:

```markdown
## Generated Test Matrix — Cycle #{n}

PRD files read: [list of files]
Total checks generated: {count}
  Infrastructure (I-): {count} [static]
  API checks: {count}
  Business logic (BL-): {count}
  Browser UI (UI-): {count}
  Cross-service (XS-): {count}
  Non-functional (NF-): {count}
  Pre-filled SKIP (untestable): {count}

Proceed to Phase 1 (infrastructure) then Phase 2 (application testing).
```

---

### Phase 1: Stack Startup & Infrastructure Verification

**Entry condition:** Docker Compose stack started per the startup sequence in `TEST-MATRIX.md`. Phase 0 test matrix generated.
**Exit condition:** All infrastructure checks pass, or failures are logged for Phase 3.

These checks are static — they test Docker/infrastructure health, not product requirements, and do not change when PRDs are updated.

Execute the **Infrastructure Checks** table from `.claude/project-config/TEST-MATRIX.md`.

---

### Phase 2: PRD-Driven Application Testing

**Entry condition:** All Phase 1 checks pass (or non-blocking ones are SKIPped). Phase 0 matrix is ready.
**Exit condition:** Every check in the generated matrix has a PASS, FAIL, or SKIP result.

Execute the test matrix generated in Phase 0 in the priority order established in Step 0d.

#### Execution Rules

1. **Authenticate first** — Run all API-AUTH-* checks at the start. Store the returned JWT access token in memory as `$JWT`. All subsequent API checks use `Authorization: Bearer $JWT`.

2. **Halt on auth failure** — If API-AUTH-1 (login) fails, mark all remaining API, BL, XS, and UI checks as SKIP with reason "auth unavailable" and proceed directly to Phase 3.

3. **Browser UI pre-condition** — If any gateway health or API-AUTH-* check fails, mark all UI-* checks as SKIP with reason "gateway/auth unavailable".

4. **Best-effort NF checks** — NF-* checks are informational. A FAIL on an NF check does not block Phase 2 completion but is still reported and triaged in Phase 3 with `medium` or `low` severity.

5. **Record PRD source on every result** — Every row in the Phase 2 results table must include the PRD Source field so failures can be traced to specific requirements.

6. **Service integration checks** — For checks involving backend services (gRPC, message queues, ML pipelines), check service logs (`docker logs <service_container> --tail 50`) for clean startup before executing. Use container names from `PROJECT.md § Repository Locations`. If a service is not healthy, mark its dependent checks as SKIP with reason "service not healthy".

#### Execution Example

For each generated test, execute the specified Method and evaluate against the PASS Condition. Record the result immediately after execution. Do not batch results — record each result as you go so partial progress is visible.

**curl pattern for authenticated endpoints** (use `<gateway_port>` from `TEST-MATRIX.md`):
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $JWT" \
  http://localhost:<gateway_port>/api/<path>
```

**grpcurl pattern for engine checks** (use `<engine_grpc_port>` and service name from `TEST-MATRIX.md`):
```bash
grpcurl -plaintext localhost:<engine_grpc_port> list
grpcurl -plaintext localhost:<engine_grpc_port> <GrpcServiceName>/<MethodName>
```

**Playwright pattern for browser UI checks:**
```
browser_navigate → browser_snapshot → browser_fill_form / browser_click → browser_wait_for → browser_snapshot
```

---

### Phase 3: Bug Triage & Fix Cycle

Read `../../shared/testing-phases.md` for Phase 3 (Bug Triage & Fix Cycle) and Phase 4 (CI Pipeline & Merge Cycle) workflow details. For this skill, the next cycle starting phase is **Phase 0** (re-read PRDs, regenerate matrix, then run startup sequence).

**PRD-specific addition to Bug Reports:** Include **PRD Source:** {prd_source} after the **Severity:** field when creating bug reports for PRD-driven failures.

### Phase 4: CI Pipeline & Merge Cycle

See `../../shared/testing-phases.md`.

**PRD-specific addition to CR Descriptions:** Include a `## PRD Traceability` section after `## Root Cause`:

```markdown
## PRD Traceability
Fixes requirement: {prd_source}
```

---

## Error Handling

Read `../../shared/testing-error-handling.md`.

Additional error handling for PRD-driven testing:

| Scenario | Recovery |
|----------|----------|
| PRD file not found | Log a warning, skip extraction for that file, note in matrix generation summary. Do not abort the cycle. |
| PRD file contains ambiguous acceptance criterion | Generate the test using the most conservative interpretation; note the ambiguity in the check's Notes field |

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
| | PRD file reading and matrix generation |

### Dispatching the Bug-Fix Sub-Agent

When delegating a fix, read `../../shared/sub-agents/bug-fix.md` and dispatch via the Agent tool with the following bug context:

- **Check ID:** {check_id}
- **PRD Source:** {prd_source}
- **Service:** {service_name}
- **Symptom:** {what_failed}
- **Root Cause:** {diagnosed_cause}
- **Relevant Logs:** {error_snippets}
- **Fix Instructions:** {specific_description_of_what_to_change}

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

### Phase 0: Matrix Generation Summary

After completing Phase 0, output this summary before starting Phase 1:

```markdown
## Test Matrix — Cycle #{n}

PRD files read:
- <feature-1>.md ({n} acceptance criteria, {n} API endpoints, ...)
- <feature-2>.md ({n} acceptance criteria, {n} API endpoints, ...)
- ... (one line per file)

Generated checks:
| Category | Count | IDs |
|----------|-------|-----|
| Infrastructure (I-) | {n} | I-1 through I-{n} [static] |
| API — Auth (API-AUTH-) | {n} | API-AUTH-1 through API-AUTH-{n} |
| API — {feature} ({prefix}-) | {n} | ... |
| Business Logic (BL-) | {n} | ... |
| Browser UI (UI-) | {n} | ... |
| Cross-Service (XS-) | {n} | ... |
| Non-Functional (NF-) | {n} | ... |
| Pre-filled SKIP (untestable) | {n} | ... |
| **Total** | **{n}** | |
```

### Test Cycle Summary

After completing Phases 1–2, output this table. The PRD Source column is required for all Phase 2 checks:

```markdown
## Test Cycle #{n} — Summary

### Phase 1: Infrastructure

| ID | Check | Result | Notes |
|----|-------|--------|-------|
| I-1 | {check description from TEST-MATRIX.md} | PASS | |
| I-2 | {check description from TEST-MATRIX.md} | PASS | |
| ... | ... | ... | ... |

### Phase 2: Application (PRD-Driven)

| ID | PRD Source | Check | Result | Notes |
|----|-----------|-------|--------|-------|
| API-AUTH-1 | <user-stories-file>.md US-1.2 | Login returns JWT | PASS | |
| API-AUTH-2 | <user-stories-file>.md US-1.2 | Bad password → 401 | PASS | |
| {API-prefix}-1 | <feature-file>.md AC-{n} | {check description} | FAIL | {failure detail} |
| ... | ... | ... | ... | ... |
| BL-1 | <feature-file>.md AC-{n} | {check description} | SKIP | {skip reason} |
| ... | ... | ... | ... | ... |
| UI-1 | <user-stories-file>.md US-1.2 | Login page renders | PASS | |
| ... | ... | ... | ... | ... |
| NF-1 | <non-functional-req-file>.md §2-Security | JWT uses HS256 | PASS | |
| NF-2 | <non-functional-req-file>.md §1-Performance | GET /health < 10ms P95 | SKIP | Latency measurement not available in integration env |

**Totals:** {pass_count} PASS / {fail_count} FAIL / {skip_count} SKIP
```

### Bug Report (for each FAIL)

Read `../../shared/testing-templates.md` for the base Bug Report template. Add **PRD Source:** {prd_source} after the **Severity:** field for PRD-driven failures.

### CR Description Template

Read `../../shared/testing-templates.md` for the base CR Description template. Add the following section after `## Root Cause`:

```markdown
## PRD Traceability
Fixes requirement: {prd_source}
```

Also add `- PRD Source: {prd_source}` to the `## Related` section.

---

## Loop Rules

1. **Always tear down and rebuild** — Before each cycle (including the first), run `git pull` on the `main` branch in every main repo clone (not in worktrees — those are for fix branches), then tear down the full stack (`docker compose --profile app down -v`), pull latest images (`docker compose --profile app pull`), and restart from Phase 0. This ensures each cycle tests the latest code with no stale state.
2. **Regenerate the matrix each cycle** — Phase 0 runs at the start of every cycle. If PRD files have changed since the previous cycle, the new criteria are automatically picked up.
3. **Track cycle numbers** — Increment the cycle counter each time you return to Phase 0.
4. **Compare across cycles** — After Phase 2, compare results against the previous cycle. Flag any regressions (checks that were PASS and are now FAIL). Also flag new checks that appeared (new PRD criteria) or removed checks (deprecated criteria).
5. **Exit conditions** — Stop the loop when:
   - Two consecutive cycles produce all-PASS results (excluding pre-filled SKIPs), OR
   - The user says stop
6. **Between cycles** — Always output the test cycle summary before starting the next cycle.

---

## User Interaction Points

Pause and wait for user input at these points:

| When | What to present | What you need |
|------|----------------|---------------|
| After Phase 0 (matrix generated) | Matrix generation summary with check counts per category | User acknowledgment to proceed to infrastructure |
| After Phase 2 (test results) | Full test cycle summary table with PRD Source column | User acknowledgment to proceed to fixes |
| Before each fix (Phase 3) | Bug report with PRD source, proposed fix, and severity | User approval of the approach |
| After CR creation | CR URL, description, and PRD traceability | User to review and merge |
| After CI failure fix | Explanation of what failed and what you changed | User acknowledgment |
| Before starting next cycle | Summary of previous cycle, what changed (new PRD criteria, regressions, fixed checks) | User confirmation to continue |

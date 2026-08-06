---
name: testing-spec
description: Use when running integration tests generated from specifications — PRDs, issues, and Gherkin .feature acceptance criteria
---

# Integration Testing Coordinator (Spec-Driven)

## Role & Objective

You are an **integration testing coordinator** for the project described in `.claude/project-config/PROJECT.md`. You stand up the full Docker Compose stack, generate an integration test matrix from the project's **specifications** — PRDs, issues, and Gherkin `.feature` acceptance criteria — verify every check, fix bugs you find, and ship fixes as change requests.

You are a **coordinator**. You delegate code/config fixes and test writing to sub-agents; you handle Docker operations, log analysis, repository host API calls, and test execution directly.

This skill supersedes `testing-prd`. `testing-static` is unrelated (a hand-written matrix) and untouched.

> **Singleton constraint:** run only one testing session (`testing-static`, `testing-spec`, or the legacy `testing-prd`) at a time — they share Docker Compose ports and containers.

---

## Prerequisites

| Type | Item | Notes |
|------|------|-------|
| Config | `.claude/project-config/PROJECT.md` | Architecture, repos, host configuration |
| Config | `.claude/project-config/TEST-MATRIX.md` | Infrastructure checks, startup sequence, model selection |
| Config | `.claude/project-config/SPEC-MANIFEST.md` | Spec sources, extraction rules, test-ID prefixes, priorities, dedup. **Falls back to the legacy `PRD-MANIFEST.md`** — see Phase 0, Step 0a |
| Env var | `API_TOKEN_ENV_VAR` | Repository host token, sourced from `<ENV_FILE_PATH>` |
| Tool | `curl`, `git`, `docker compose` | API/health checks, branches/worktrees, stack management |
| Tool | Playwright MCP | Browser UI checks (`UI-*`) |
| Tool (optional) | Gherkin parser CLI | Used if present; inline fallback otherwise — see Step 0b |

---

## Environment Setup

Read `../../shared/environment-setup.md` and `../../shared/trunk-branch.md`.

### Container Registry Configuration

Read `../../shared/testing-container-registry.md`.

### Docker Compose Startup Sequence and Model Selection

Read the **Docker Compose Startup Sequence** and **Model Selection** sections of `.claude/project-config/TEST-MATRIX.md`.

---

## Test Cycle

Five phases per cycle, run in order; a cycle number tracks progress across iterations.

### Phase 0: Spec Discovery & Test Generation

**Entry:** start of each cycle, before Phase 1. **Exit:** a complete test matrix, each check traceable to its source spec.

#### Step 0a: Resolve the manifest (migration-safe)

Read `.claude/project-config/SPEC-MANIFEST.md`. **If it is absent but a legacy `PRD-MANIFEST.md` is present, use `PRD-MANIFEST.md`** and print once: `SPEC-MANIFEST.md not found — using legacy PRD-MANIFEST.md. Consider running /project-workflows:init to migrate.` Never mutate either file.

#### Step 0b: Enumerate spec sources and extract

From the manifest's **Spec Sources**, enumerate at runtime (never hardcode filenames):

- **PRD / requirement Markdown** — apply the manifest's extraction rules (API tables, acceptance criteria, error tables, non-functional subsections).
- **Issues** — extract acceptance criteria listed on referenced issues.
- **Gherkin `.feature` files** — one check per `Scenario`; a `Scenario Outline` expands to one check per `Examples` row. Map `Given` → setup/preconditions, `When` → the action (curl/grpcurl/Playwright), `Then` → the PASS condition.

**Gherkin parsing (optional tool, never a hard dependency):** if a Bun/Node-runnable Gherkin parser or linter is available in the consumer environment (e.g. `@cucumber/gherkin-utils`, `gherkin-lint`), use it to parse and validate `.feature` files; otherwise fall back to a lightweight inline Given/When/Then parse. Do not add a required dependency. Keep `.feature` files valid Gherkin — v1 generates checks from them but does not execute them through a Cucumber runner; a documented **runner-adapter seam** (map parsed steps → executable Method) is where a real runner would later attach.

#### Step 0c: Generate the matrix

Classify each extracted criterion into a check using the manifest's **Test ID Prefixes** (the static `I-`/`BL-`/`UI-`/`XS-`/`NF-` categories plus project `API-*` prefixes). Each check carries:

```
ID          : <category prefix><sequential number>
Spec Source : <source> <criterion id>  (e.g. "02-recommendations.md AC-5", "#42 AC-3", "checkout.feature: Reject empty cart")
Description : derived from the criterion / scenario
Method      : the curl / grpcurl / Playwright action
PASS Cond.  : the observable outcome (from the Then step or acceptance criterion)
```

Every check must trace back to its originating scenario/criterion via **Spec Source**.

#### Step 0d: Deduplicate, prioritize, output

Apply the manifest's **Deduplication Rules** (cite all sources on a merged check) and **Feature Priorities** ordering (auth/health first, then Must/Should Have, then BL → XS → UI → NF). Output a matrix summary (files/issues/features read, counts per category) before Phase 1.

### Phase 1: Stack Startup & Infrastructure Verification

Start the Docker Compose stack per the startup sequence in `TEST-MATRIX.md`, then execute the **Infrastructure Checks** table from `.claude/project-config/TEST-MATRIX.md`. These checks are static (Docker/infrastructure health) and do not change with the specs.

### Phase 2: Spec-Driven Application Testing

Execute the Phase 0 matrix in the priority order from Step 0d, storing the auth JWT and recording each result with its **Spec Source** as you go (authenticate first; halt dependent checks on auth failure with SKIP "auth unavailable"; `UI-*` require gateway/auth PASS; `NF-*` are best-effort). Record each result immediately.

### Phase 3–4: Triage & Merge

Read `../../shared/testing-phases.md` for Phase 3 (bug triage & fix) and Phase 4 (CI & merge). The next cycle's starting phase is **Phase 0** (re-read specs, regenerate).

**Spec traceability additions:** add `Spec Source: {spec_source}` after **Severity:** in bug reports, and a `## Spec Traceability` section (`Fixes requirement: {spec_source}`) after `## Root Cause` in CR descriptions.

---

## SPEC-MANIFEST Schema

This skill **owns the format** of `SPEC-MANIFEST.md`; `init` (R6) authors the template file to it. `SPEC-MANIFEST.md` generalizes `PRD-MANIFEST.md` and must define:

| Section | Purpose |
|---------|---------|
| **Spec Sources** | Where specs live — PRD/requirement directories, issue references, and `.feature` file globs. Enumerated at runtime, not hardcoded. |
| **Extraction Rules** | How to extract from each source type, including the **Gherkin shape**: `Scenario` → check, `Scenario Outline` + `Examples` → one check per row, `Given/When/Then` → setup/method/PASS-condition. |
| **Test ID Prefixes** | Category → ID prefix → source → method (static `I-`/`BL-`/`UI-`/`XS-`/`NF-` plus project `API-*`). |
| **Feature Priorities** | Category → Must/Should/Nice-to-Have, controlling execution order. |
| **Deduplication Rules** | Merge overlapping criteria into one check citing all sources; mark integration-untestable items SKIP. |

A `SPEC-MANIFEST.md` is a strict superset of a `PRD-MANIFEST.md` (spec sources subsume the PRD directory), so a legacy manifest remains readable during the migration window.

---

## Error Handling

Read `../../shared/testing-error-handling.md`. Additional:

| Scenario | Recovery |
|----------|----------|
| A spec source (file/issue) is missing | Warn, skip it, note in the matrix summary; do not abort the cycle |
| Ambiguous acceptance criterion | Generate the check with the most conservative interpretation; note the ambiguity |
| Invalid `.feature` file | Report the parse error, skip that file's scenarios, continue |

---

## Sub-Agent Delegation

Delegate code/config fixes, test writing, and linting to sub-agents; do Docker operations, diagnosis, host API calls, and test execution directly. To dispatch a fix: create a worktree per `../../shared/worktree-setup.md` (branch `fix/{check_id}-{short_description}`), then read `../../shared/sub-agents/bug-fix.md` and dispatch via the Agent tool with the check ID, **Spec Source**, service, symptom, root cause, logs, fix instructions, and the worktree path.

---

## Repository Host API

Read `../../shared/api-dispatch.md`. Operations: `CREATE_CR`, `GET_CR_PIPELINES`, `GET_PIPELINE_JOBS`, `GET_JOB_LOG`.

---

## Structured Output & Templates

Read `../../shared/testing-templates.md` for the base Bug Report and CR Description templates; apply the Spec traceability additions above. Output a per-cycle results table with a **Spec Source** column on every Phase 2 check, plus PASS/FAIL/SKIP totals.

---

## Loop Rules

Tear down and rebuild each cycle (pull `main` in every main clone, `docker compose --profile app down -v`, pull images, restart at Phase 0). Regenerate the matrix each cycle so new/updated specs are picked up. Track cycle numbers; compare across cycles and flag regressions. Exit when two consecutive cycles are all-PASS (excluding pre-filled SKIPs) or the user says stop.

---

## User Interaction Points

Pause for the user after Phase 0 (matrix summary), after Phase 2 (results table), before each fix (bug report + proposed fix), after CR creation, after a CI-failure fix, and before starting the next cycle.

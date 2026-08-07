<!-- pw-version: 1.4.0 -->
# Spec Manifest

Defines how the `testing-spec` skill's Phase 0 discovers and extracts checks from the project's **specifications** — PRDs, issues, and Gherkin `.feature` files. Generalizes the legacy `PRD-MANIFEST.md`; `testing-spec` reads this file, or falls back to `PRD-MANIFEST.md` when it is absent.

> `pw-version` above is the **config-structure** version, decoupled from the plugin's release version.

## Spec Sources

List where specifications live. Enumerate members at runtime — **do not hardcode filenames.**

| Source type | Location | Notes |
|-------------|----------|-------|
| PRD / requirement Markdown | <!-- REPLACE THIS: directory, e.g. `docs/prd/` --> | Read all Markdown files in the directory |
| Gherkin features | <!-- REPLACE THIS: glob, e.g. `docs/features/**/*.feature` --> | One check per Scenario |
| Issues | <!-- REPLACE THIS: how issues are referenced, or 'none' --> | Extract acceptance criteria from referenced issues |

## Extraction Rules

### PRD / requirement Markdown

For each file, extract: API endpoints (method, path, auth, expected responses), the Acceptance Criteria list, error-response tables, and testable non-functional requirements. Locate content by section heading.

### Gherkin `.feature` files

- One check per `Scenario`; a `Scenario Outline` expands to one check per `Examples` row.
- Map `Given` → setup/preconditions, `When` → the action (curl / grpcurl / Playwright), `Then` → the PASS condition.
- Keep `.feature` files valid Gherkin. Prefer a Bun/Node-runnable Gherkin parser/linter (e.g. `@cucumber/gherkin-utils`, `gherkin-lint`) if available in your environment; otherwise a lightweight inline Given/When/Then parse is used. No parser is required.

### Issues

Extract the acceptance-criteria list from each referenced issue.

## Test ID Prefixes

<!-- REPLACE THIS: Add your feature-specific categories here. ID Prefix should be short (3-6 chars), unique, and meaningful. -->

| Category | ID Prefix | Source | Test Method |
|----------|-----------|--------|-------------|
| Infrastructure | `I-` | Static (never changes) | Docker exec, curl |
| Business Logic | `BL-` | Acceptance criteria requiring specific inputs | Multi-step API calls |
| Browser UI | `UI-` | Scenarios / user stories — browser-testable flows | Playwright MCP tools |
| Cross-Service | `XS-` | Criteria spanning multiple services | Multi-step API + log verification |
| Non-Functional | `NF-` | Non-functional requirements | Performance/security checks |
| <!-- REPLACE THIS --> | `FEAT1-` | <!-- Feature spec source --> | curl HTTP calls |

## Feature Priorities

<!-- REPLACE THIS: List your feature categories and their priorities (Must Have / Should Have / Nice to Have). Controls execution order. -->

| Category | Priority |
|----------|----------|
| <!-- REPLACE THIS: feature category name --> | Must Have |
| <!-- REPLACE THIS: feature category name --> | Should Have |
| <!-- REPLACE THIS: feature category name --> | Nice to Have |

## Deduplication Rules

1. **Cross-source overlap** — if the same requirement appears in more than one source (PRD, issue, `.feature`), generate **one check** and cite all sources in its Spec Source field.
2. **NFR vs feature overlap** — if a non-functional requirement restates a feature acceptance criterion, generate one check citing both.
3. **Untestable in integration** — mark requirements that cannot be meaningfully tested in the integration environment (latency SLAs, ML quality, external availability) as SKIP with a reason.

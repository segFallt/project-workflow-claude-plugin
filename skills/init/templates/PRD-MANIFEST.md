<!-- pw-version: 1.1.0 -->
# PRD Manifest

Defines how the `testing-prd` skill's Phase 0 should discover and extract from product requirement documents. PRD files are not a static list — they live in a directory that grows over time.

## PRD Directory

Read the PRD directory path from `PROJECT.md § Domain Concepts → PRD Files`.

Read all Markdown files in that directory as PRD inputs. **Do not hardcode filenames** — enumerate them at runtime.

## Extraction Rules

### Standard feature PRDs

Most files describe a single feature. For each, extract:
- **API endpoints table**: method, path, auth requirement, expected HTTP responses
- **Acceptance criteria**: the numbered list in the "Acceptance Criteria" section (typically the last major section)
- **WebSocket events**: event names and their trigger conditions
- **Error response tables**: non-2xx HTTP status codes and the conditions that produce them

Sections are typically numbered (§1 Overview, §6 API endpoints, §9 Acceptance Criteria) but use section headings to locate content if numbering differs.

### User stories file

Files whose name contains `user-stories` follow a different format. Extract:
- Per-epic acceptance criteria bullet points
- Any flow that involves browser navigation, form submission, or UI state (these map to Playwright tests)
- Epic priority from the Story Map Summary table

### Non-functional requirements file

Files whose name contains `non-functional` follow a different format. Extract testable requirements only — skip qualitative statements. Extract by named subsection:
- Performance: latency targets per endpoint category
- Security: JWT algorithm, password storage method, field serialization guards
- Reliability: DLQ pattern, health check endpoint contract, gRPC timeout values
- Observability: `/health` endpoint response shape, audit log table existence

## Test ID Prefixes

<!-- REPLACE THIS: Add your feature-specific categories here -->
<!-- Add one row per major feature area. The ID Prefix should be short (3-6 chars), unique, and meaningful. The Source column is the PRD filename or pattern. -->

| Category | ID Prefix | Source | Test Method |
|----------|-----------|--------|-------------|
| Infrastructure | `I-` | Static (never changes) | Docker exec, curl |
| Business Logic | `BL-` | Acceptance criteria requiring specific inputs | Multi-step API calls |
| Browser UI | `UI-` | User stories — browser-testable flows | Playwright MCP tools |
| Cross-Service | `XS-` | Acceptance criteria spanning multiple services | Multi-step API + log verification |
| Non-Functional | `NF-` | Non-functional requirements file | Performance/security checks |
| <!-- REPLACE THIS --> | `FEAT1-` | <!-- Feature PRD filename or pattern --> | curl HTTP calls |
| <!-- REPLACE THIS --> | `FEAT2-` | <!-- Feature PRD filename or pattern --> | curl HTTP calls |

## Feature Priorities

<!-- REPLACE THIS: List your feature categories and their priorities -->
<!-- This table controls which features get tested first. Use "Must Have" for core functionality, "Should Have" for important but non-blocking features, and "Nice to Have" for optional enhancements. -->

| Category | Priority |
|----------|----------|
| <!-- REPLACE THIS: feature category name --> | Must Have |
| <!-- REPLACE THIS: feature category name --> | Should Have |
| <!-- REPLACE THIS: feature category name --> | Nice to Have |

## Deduplication Rules

1. **Feature PRD vs user story overlap** — If the same requirement appears in both, generate **one test** and cite both sources in the PRD Source field. Use the feature PRD as primary; cite the user story as secondary.

2. **NFR vs feature PRD overlap** — If an NFR restates something already covered by a feature PRD acceptance criterion, generate one test and cite both sources.

3. **Untestable in integration** — Mark the following as SKIP with a reason:
   - List requirements that cannot be meaningfully tested in your integration environment (e.g., latency SLAs, ML model quality, external service availability). Mark these SKIP with a reason.

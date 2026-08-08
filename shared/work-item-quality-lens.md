# Work-Item Quality Lens (Critique + Triage + Output Shaping)

Instruction module for a coordinator skill. Critiques a draft or existing work item, classifies each finding, and shapes the final body. Consumes the grounded-requirements block and cross-check findings from `shared/requirements-context.md`; emits a clean body per `shared/work-item-templates.md`.

## Critique taxonomy

Apply four lenses to the item:

1. **Invalid assumptions** — premises the item takes for granted that do not hold.
2. **Inaccurate claims** — statements about behaviour, structure, or scope that are **verified against the actual code** via the code-exploration output (`shared/sub-agents/code-exploration.md`). A claim the code contradicts is a finding.
3. **Open decisions** — unresolved choices the item leaves dangling (which approach, which interface, which trade-off).
4. **Incomplete plans / unaccounted dependencies** — missing steps, or dependencies (packages, services, other work items, migrations, config) the item does not account for.

## Standards overlay hook

When `.claude/project-config/STANDARDS.md` is present, apply **every applicable row** — the **Universal Principles** section plus the **affected repo's** section — as additional critique criteria on top of the four lenses. **Ignore the `Severity` column** (triage below governs resolution). Degrade gracefully when the file is absent: skip this overlay, do not fabricate criteria. Do **not** embed any project-specific criteria in this module — all specifics are read from `STANDARDS.md` at runtime.

## Triage classification

Classify every finding into one of two buckets — the **triage-and-escalate** contract:

| Bucket | What qualifies | Action |
|--------|----------------|--------|
| **Objective findings** | Factually wrong claim, unaccounted dependency, standards violation, Direction-1 requirement violation, a clearly missing step | **Auto-resolve** — fold the fix into the rewritten body **without asking** |
| **Open decisions + genuine uncertainty** | An unresolved choice, or a resolution that depends on user intent/preference | **Escalate to the user — one at a time** |

Refine mode has **no per-item approval gate**: objective findings are resolved silently and the escalations are the only user touchpoints. Surface open decisions sequentially (one question, wait, next) rather than as a batch.

## Output shaping

The resulting body must be a **clean, self-contained** representation of **implementation requirements + Gherkin acceptance criteria** — no dangling questions, no dependence on external spec files (requirements are inlined per `shared/requirements-context.md`).

- **Acceptance-criteria form** — write AC as Gherkin per `skills/documentation/templates/gherkin-guide.md`: declarative, **one behaviour per scenario**, not UI-coupled. **Process gates** (lint, tests, docs) go in **Definition of Done**, never in Given/When/Then.
- **Body templates** — use the concrete Bug / Feature / Task templates in `shared/work-item-templates.md`. Refine mode also posts the summary comment defined there.

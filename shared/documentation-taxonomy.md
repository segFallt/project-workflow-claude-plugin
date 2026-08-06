## Documentation Taxonomy, Profiles & Escalation

Canonical, project-agnostic reference for the documentation framework. This file defines the taxonomy, the profile levels, and the escalation matrix **once**; the rest of the framework reads them here rather than restating them:

- the shared `shared/sub-agents/doc-authoring.md` sub-agent reads the escalation matrix to decide which documents a change needs,
- `init` stores a project's chosen profile under `PROJECT.md § Design Documentation`,
- the author-facing decision guide restates the matrix for humans.

No logic lives here — this is definition and data.

### Taxonomy

| Doc | Question it answers | Level | Authored when |
|-----|---------------------|-------|---------------|
| BRD — Business Requirements | Why: business goal, scope, stakeholders | Project-wide | Project inception, or a business pivot |
| PRD — Product Requirements | What: user-facing behaviour and acceptance criteria (Gherkin) | Per initiative | Before building a feature |
| SDD — Software Design | How (structure): architecture, components, data flow, interfaces | Per initiative or service | A change adds a service/API surface or otherwise non-trivial design |
| TSD — Technical Specification | How (detail): technical decisions, schemas, algorithms, trade-offs | Per initiative | Architecturally significant change |

PRD + its Gherkin acceptance criteria are the mandatory core. BRD is project-level and optional — authored at inception or a pivot, not per feature.

### Profiles

A profile sets the **ceiling** of documents a project maintains. Default is `standard`.

| Profile | Doc set |
|---------|---------|
| `lite` | PRD (+ Gherkin AC) |
| `standard` (default) | PRD (+ Gherkin AC); SDD when a change adds a service/API |
| `full` | PRD (+ Gherkin AC), SDD, TSD; BRD at project level |

### Escalation matrix

The profile sets the ceiling; this matrix sets the per-change **floor**. For a given change, author the documents its significance requires, capped by the project's profile.

| Change significance | Documents |
|---------------------|-----------|
| Trivial (typo, small fix, refactor with no behaviour change) | none |
| Feature (new or changed user-facing behaviour) | PRD (+ Gherkin AC) |
| New service or API surface, or otherwise non-trivial design | + SDD |
| Architecturally significant | + TSD |
| Business pivot / new product direction | BRD, then cascade PRD/SDD/TSD for affected initiatives |

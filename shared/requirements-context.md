# Requirements Context (Grounding + Bidirectional Cross-check)

Instruction module for a coordinator skill. **Purpose:** ground a work item in the project's product/architecture requirements *before* composing (create mode) or refining (refine mode) it, and cross-check it against those requirements in both directions. Feeds `shared/work-item-quality-lens.md` (findings) and `shared/work-item-templates.md` (a grounded-requirements block inlined into the body).

## Inputs

| Input | Source |
|-------|--------|
| Change description | The prose request (create) or the current work-item body(ies) (refine) |
| Code-exploration output | The sub-agent dispatched per `shared/sub-agents/code-exploration.md` (verifies the item against actual code) |
| Documentation registry | `PROJECT.md § Design Documentation` — the index of BRD/PRD/SDD/TSD the `documentation` skill registers |

## Process

1. **Read the registry as an index.** `PROJECT.md § Design Documentation` lists the project's registered docs; it is a pointer, not the content.
2. **Select the relevant subset.** From the registry, pick the PRD/SDD/BRD/TSD (or subset) that governs the affected behaviour, service, or component. Use the change description and code-exploration output to scope the selection.
3. **Verify the item against the selected docs.** Confirm the item's intent, scope, and claims are consistent with the governing requirements and architecture.
4. **Inline the needed requirements.** Copy the specific requirements the item depends on **into the item body** (grounded-requirements block) so the item is self-contained. **Never make the item depend on committed spec files** — a reader of the issue must not need to open a repo doc to understand it.

## Bidirectional cross-check

Run **both** directions explicitly:

- **Direction 1 — the item vs. the requirements.** Flag any requirement the item would **violate** but is **not explicitly changing**. (A silent regression against a governing PRD/SDD is a finding, not an intended change.) Emit as a cross-check finding for triage.
- **Direction 2 — the requirements vs. the item.** Detect a required PRD/architecture update that is **missing from the item's acceptance criteria** (a behaviour change that ought to update a governing doc, with no AC covering that doc work):
  1. **Check existing coverage first** — is the doc update already covered by this item's AC, or by a linked work item?
  2. If **uncovered**, **add the AC by default** (an inline acceptance criterion for the doc update).
  3. **Escalate the choice** "inline AC vs. separate linked work item" **only when the doc work is substantial** — enough to warrant its own item. A separate item is created via `work-item` **create** mode and linked back.

## Outputs

- **Grounded-requirements block** — the inlined requirements, for insertion into the item body (see `shared/work-item-templates.md`).
- **Cross-check findings** — Direction 1 violations and Direction 2 gaps, handed to the quality lens's triage (`shared/work-item-quality-lens.md`).

## Graceful degradation

When `PROJECT.md § Design Documentation` registers **no** product/architecture docs (no BRD/PRD/SDD/TSD — e.g. a project that maintains none):

- **Skip** the cross-check entirely.
- **Record** in the outputs that "no requirements grounding was available."
- **Proceed** with composition/refinement using the change description and code-exploration output alone.

Never fail the run and never fabricate requirements to fill the gap.

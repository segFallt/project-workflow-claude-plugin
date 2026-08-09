# Software Design Document — Progressive Disclosure Across Coordinator Skills

> Documents how this plugin's skills apply progressive disclosure and the Layer-3 file taxonomy that governs where relocated skill content belongs. This is the canonical home for the `references/` convention; the `STANDARDS.md` progressive-disclosure row and individual skill bodies point here. No user-facing behaviour change — this is a structural/authoring convention, so an SDD (not a PRD) is the right tier under the `standard` documentation profile.

## Overview

The plugin's user-facing skills are coordinators: a single `SKILL.md` orchestrates a multi-phase workflow and delegates focused work to sub-agents. As skills accreted output templates, error matrices, and long procedures inline, several `SKILL.md` bodies grew past the point where a reader loads far more than any one step needs — `init` at ~848 lines, `development` at ~498.

**Progressive disclosure** is the countermeasure: a skill loads only what the current step needs, deferring detailed procedures and examples to reference files that are read on demand. This document describes the three-layer model as applied to these skills, and — the part authors get wrong without a rule — the taxonomy that decides *which kind of Layer-3 file* a relocated block becomes.

The model is descriptive of existing good practice as much as prescriptive. Two skills already conform and serve as reference implementations: `documentation` keeps its BRD/PRD/SDD/TSD skeletons in `skills/documentation/templates/` and delegates authoring via `shared/sub-agents/doc-authoring.md`; `work-item` keeps its whole quality engine in on-demand `shared/` modules (`requirements-context.md`, `work-item-quality-lens.md`, `work-item-templates.md`) read only when a step needs them. (`plain-language` is simply lean enough to need no Layer-3 relocation — not an exemplar of the pattern so much as a skill small enough not to require it.) The `shared/` modules and `shared/sub-agents/` prompts are themselves progressive disclosure applied across skills.

## Architecture

Three layers, loaded in order and only as far as a task requires:

| Layer | What it is | When it loads | Where it lives |
|-------|-----------|---------------|----------------|
| **L1 — Discovery** | The `SKILL.md` YAML frontmatter (`name`, `description`). Lets the harness decide *whether* a skill applies without reading its body. | Always, cheaply, for every skill in the catalogue. | `skills/<name>/SKILL.md` frontmatter |
| **L2 — Coordinator body** | The Markdown body of `SKILL.md`: role, phase sequence, decision logic, and one-line *pointers* to Layer-3 files at the step that needs each. | When the skill is invoked. | `skills/<name>/SKILL.md` body |
| **L3 — On-demand detail** | Output templates, verbose procedures, delegated sub-agent prompts, and cross-skill modules — each read only at the step that references it. | Only when a pointer in L2 is reached at runtime. | `skills/<name>/{templates,references,sub-agents}/` and `shared/` |

The lever is L2 → L3: the coordinator body stays a navigable map of the workflow, and the heavy detail sits behind a `Read …` pointer that a run only follows when it reaches the relevant step. A fresh-init run, for example, never reaches the Update-Mode pointer, so that detail is never loaded.

> **Out of scope (deferred):** *how* a step consumes L3 detail once loaded — reading it into context vs. executing it CLI-first (grep/sed over the file) — is a separate behavioural lever, not part of this structural convention.

## Components — the Layer-3 taxonomy

Layer 3 has **four homes**. The home is chosen by the *kind of content*, not by which skill it came from:

| Home | Content kind | Defining test |
|------|-------------|---------------|
| `skills/<name>/templates/` | A reusable **artifact skeleton** the skill fills in and emits, or the user fills in — config files, output documents, comment/report shapes. | Is it a *shape* that gets reproduced (emitted or filled in)? → `templates/` |
| `skills/<name>/references/` | Read-only **explanatory prose or procedure** the body points to — how to do a step, a rules matrix, an error table, or a static snippet the skill emits verbatim. | Is it *prose/procedure* the reader consults, not a shape? → `references/` |
| `skills/<name>/sub-agents/` | A **delegated prompt** dispatched to a sub-agent via the Agent tool. | Is it dispatched as an agent task? → `sub-agents/` |
| `shared/` (and `shared/sub-agents/`) | A module used by **more than one skill** — the same content pointed to from several `SKILL.md` bodies. | Is it cross-skill? → `shared/` |

### `templates/` is defined by artifact shape — not by markers

The narrow reading to avoid: "`templates/` is only for files carrying `REPLACE THIS`/`pw-version` markers." Those markers are a *fill-in* convention some templates use — they are **not** what makes something a template, and they are not confined to one skill. On current `main`, `init`'s config templates carry them, and so do `skills/documentation/templates/{BRD,PRD,SDD,TSD}.md` (8/15/9/7 `REPLACE THIS` markers respectively); meanwhile `shared/testing-templates.md` (Bug Report / CR Description shapes) carries **none**. All three are `templates/`. What unifies them is **artifact shape**: a structure the skill reproduces — marker presence varies and is not the defining test. A design-document skeleton, a CR-description skeleton, and a review-feedback report are all `templates/` whether or not they carry markers.

### Resolving borderline blocks

- A **shape** that gets emitted or filled in → `templates/`.
- A **procedure or a verbatim-emitted snippet** (e.g. `init`'s CLAUDE.md block, which is read-only prose the skill emits as-is) → `references/`.
- When a block is genuinely both, split it: the shape to `templates/`, the surrounding how-to prose to `references/`.

## Data flow — an invocation

1. Harness reads **L1** frontmatter across the catalogue; a `description` match surfaces the skill.
2. The skill is invoked; its **L2** body loads. The body is a phase coordinator with pointers.
3. At each step, the coordinator follows only the pointers that step needs — an output **template** at its emitting step, a **reference** procedure on first entry to that phase, a **sub-agent** prompt when it delegates, a **shared** module when a cross-cutting concern applies.
4. Detail behind un-reached pointers (e.g. an error-handling reference on a run with no failures, or Update-Mode detail on a fresh-setup run) is **never loaded**.

## Interfaces & contracts

- **Pointer idiom.** L2 references L3 with a one-line `Read …` pointer carrying a repo-relative path: `./templates/<x>.md`, `./references/<x>.md`, `./sub-agents/<x>.md` (relative to the skill directory) or `../../shared/<x>.md` (repo root). Replacing an inlined block with its pointer at the exact step is the mechanical form of a retrofit.
- **CI validation.** `.ci/smoke-test.sh` resolves those four pointer forms in every `SKILL.md` and fails the job on any target that is missing or empty — a dangling relocation link cannot merge. The check runs identically in the GitLab (`smoke-test` job) and GitHub (`validate-plugin` workflow) pipelines.
- **Release packaging.** The release archive is built as `tar czf "$ARCHIVE" skills/ shared/ .claude-plugin/ README.md CHANGELOG.md` — the `skills/` and `shared/` trees ship (alongside the manifest, README, and changelog). Every Layer-3 file an installed skill loads **must** live under `skills/` or `shared/` — a `references/`/`templates/` file placed anywhere else would resolve in the repo but be absent from the shipped plugin. This SDD itself lives under `docs/`, which is **not** in the archive, because it is *source documentation*, read by contributors, not loaded by any skill at runtime — intentionally not shipped.
- **Frontmatter contract.** `.ci/validate-frontmatter.ts` checks `name` + `description` on `SKILL.md` only. `templates/` and `references/` `.md` files therefore carry **no** frontmatter.

## Data model

File-based; no schema. The per-skill layout a retrofit targets:

```
skills/<name>/
  SKILL.md              # L1 frontmatter + L2 coordinator body
  templates/<x>.md      # L3 — artifact skeletons (no frontmatter)
  references/<x>.md      # L3 — prose/procedure (no frontmatter)
  sub-agents/<x>.md      # L3 — delegated prompts
shared/
  <x>.md                 # L3 — cross-skill modules
  sub-agents/<x>.md      # L3 — cross-skill delegated prompts
```

## Author guidance — where does relocated content go?

When trimming a coordinator body, for each block ask, in order:

1. **Used by more than one skill?** → `shared/` (or `shared/sub-agents/` if it is a delegated prompt).
2. **Dispatched to a sub-agent?** → `skills/<name>/sub-agents/`.
3. **A shape the skill reproduces** (emits or fills in) — config file, output document, comment/report? → `skills/<name>/templates/`.
4. **Otherwise** — explanatory prose, a procedure, a rules/error matrix, or a static snippet emitted verbatim? → `skills/<name>/references/`.

Then replace the block in `SKILL.md` with a one-line `Read …` pointer at the step that needs it, keep the moved content **byte-identical** to what it replaced (so behaviour is unchanged and `git diff` shows the body changed only by the pointer), and confirm the target lands under `skills/` or `shared/` so it ships. `smoke-test.sh` enforces that the pointer resolves.

## Error handling & failure modes

| Failure | Cause | Guard |
|---------|-------|-------|
| Dangling pointer | L2 points to a moved/renamed L3 file | `smoke-test.sh` fails CI naming the `SKILL.md` and path |
| Shipped skill missing detail | L3 file placed outside `skills/`/`shared/` | Release-archive tar scope + author-guidance step 3/4 destinations |
| Behaviour drift on relocation | Moved block edited, not moved verbatim | Loss-free check: `git diff` shows only the pointer changed; byte-identical target |
| Frontmatter validation error | Frontmatter added to a `templates/`/`references/` file | Convention: those files carry none; `validate-frontmatter` scopes to `SKILL.md` |

## Alternatives considered

- **A PRD instead of an SDD.** Rejected — there is no user-facing product behaviour change; this is an internal structural/authoring convention. The `standard` profile maps non-trivial design with no product surface to an SDD.
- **A one-line note in `PROJECT.md`.** Rejected — the taxonomy and its borderline rules need more than a sentence, and belong in a discoverable design doc registered in the doc index rather than buried in project config.
- **Two Layer-3 homes (`templates/` + `sub-agents/`), folding references into templates.** Rejected — prose/procedure and reproduced shapes are different kinds with different tests; collapsing them reintroduces the "templates = fill-in only" confusion this taxonomy exists to remove.
- **A whole-plugin architecture doc.** Deferred — scoped to this initiative to keep it right-sized.

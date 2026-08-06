---
name: documentation
description: Use when authoring or updating project documentation (BRD/PRD/SDD/TSD) — right-sizes which documents a change needs and drafts them from templates.
---

# Documentation

## Role & Objective

You are a **coordinator** for authoring right-sized project documentation. You do not decide document sizing or draft prose yourself — you delegate that to the shared `doc-authoring` sub-agent (the single owner of escalation and authoring) and delegate codebase understanding to the shared `code-exploration` sub-agent. You handle user interaction, approval, and writing the approved files.

**Success criteria:**
- The documents authored match the change's significance and the project's profile (per the escalation matrix the sub-agent reads).
- Each document is drafted from its template with every fill-in marker resolved; the PRD carries valid Gherkin acceptance criteria.
- Authored documents are registered under `PROJECT.md § Design Documentation`.

## Environment Setup

Read `.claude/project-config/PROJECT.md` — in particular `§ Design Documentation` for the documentation **profile** (`lite` / `standard` / `full`, default `standard`) and the docs root, and `§ Repository Locations` for the target repo.

## Workflow

### Phase 1: Intake

Establish what change is being documented (feature, new service, architecture change, business pivot) and confirm the target repo. Ask the user for anything unclear. Do not classify significance yourself — the sub-agent does that from the escalation matrix.

### Phase 2: Codebase Context

Read `../../shared/sub-agents/code-exploration.md` and dispatch it via the Agent tool (purpose `"issue-context"`) to gather the files, interfaces, and patterns relevant to the change. Skip only for a pure business-level BRD with no code surface.

### Phase 3: Sizing & Authoring

Read `../../shared/sub-agents/doc-authoring.md` and dispatch it via the Agent tool, passing the change description, the Phase 2 codebase context, the profile, and the docs root. It returns the sizing decision plus the drafted documents and their registration entries.

When Phase 2 was skipped (pure BRD, no code surface), pass `n/a — no code surface` for the codebase-context placeholder so it is never left dangling.

> Do not re-implement sizing or authoring here. This skill dispatches the sub-agent; the escalation matrix and template-filling live in `../../shared/sub-agents/doc-authoring.md` and `../../shared/documentation-taxonomy.md`.

### Phase 4: Review

Present the sub-agent's `sizing.rationale` and each drafted document to the user. Incorporate requested changes (re-dispatch the sub-agent if substantial). Wait for approval before writing files.

### Phase 5: Write & Register

Write each approved document to its `path`. Add each `registration` entry to `PROJECT.md § Design Documentation`. Report the files written.

## Sub-Agent Delegation

| Delegate to sub-agent | Do directly |
|-----------------------|-------------|
| Document sizing + drafting (`doc-authoring`) | User interaction and approval |
| Codebase context (`code-exploration`) | Writing approved files; registering in `PROJECT.md` |

Dispatch sub-agents with the **Agent tool** — never invoke another skill via the Skill tool, and never nest coordinators.

---
name: documentation
description: Use when authoring or updating project documentation (BRD/PRD/SDD/TSD) — right-sizes which documents a change needs and drafts them from templates.
---

# Documentation

Authors and updates a project's design documentation, right-sized to the change at hand. It reads the taxonomy, profile, and escalation matrix in `../../shared/documentation-taxonomy.md` to decide which documents a change needs, then drafts them from the templates in this skill's `templates/` directory.

## Assets

- `templates/BRD.md`, `templates/PRD.md`, `templates/SDD.md`, `templates/TSD.md` — the four document templates (the PRD carries a Gherkin acceptance-criteria section).
- `templates/decision-guide.md` — which document to author for a given change significance.
- `templates/gherkin-guide.md` — how to write the PRD's Gherkin acceptance criteria.

## Workflow

1. Determine the change's significance and the project's documentation profile (`../../shared/documentation-taxonomy.md`).
2. From the decision guide, pick the documents to author or update.
3. Draft each from its template, filling every `<!-- REPLACE THIS -->` marker; write the PRD's behavioural acceptance criteria as Gherkin per the Gherkin guide.
4. Register authored documents under `PROJECT.md § Design Documentation`.

> The escalation and authoring behaviour is owned by the shared `doc-authoring` sub-agent (added in R2, issue #30), which this skill dispatches via the Agent tool. Until then, follow the workflow above directly.

# Doc-Authoring Sub-Agent

## Purpose

Single owner of document sizing and authoring for the documentation framework. Dispatched via the Agent tool by the `documentation` skill (issue #30) and by the `development` skill (issue #31). It reads the escalation matrix in `shared/documentation-taxonomy.md`, decides which documents a change needs, drafts them from the `skills/documentation/templates/` templates, writes the PRD's Gherkin acceptance criteria, and reports where to register each document.

The sizing and authoring logic lives **only** here — coordinators dispatch this sub-agent rather than restating the taxonomy or escalation rules.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You author right-sized documentation for the project described in `.claude/project-config/PROJECT.md`.

## Change to document
{change_description}

## Codebase context
{code_exploration_output_or_summary}

## Project context
- **Repo / local path:** {repo_name} — {local_repo_path}
- **Documentation profile:** {profile — lite | standard | full; default standard if unset}
- **Docs root:** {docs_root from PROJECT.md § Design Documentation}

## Instructions

1. Read `shared/documentation-taxonomy.md`. Use its escalation matrix to decide which documents this change needs, given the change's significance and the project's profile (the profile is the ceiling; the matrix is the floor).
2. For each required document, draft it from its `skills/documentation/templates/` template ({BRD,PRD,SDD,TSD}.md). Fill every `<!-- REPLACE THIS -->` marker with content grounded in the change and codebase context — never leave a marker unfilled and never invent facts not supported by the context.
3. Write the PRD's behavioural acceptance criteria as Gherkin per `skills/documentation/templates/gherkin-guide.md`. Keep every `.feature` block valid; if a Gherkin parser/linter is available (e.g. `@cucumber/gherkin`), validate before returning. Process/DoD gates go in the PRD's Definition of Done, not in Given/When/Then.
4. Do NOT restate the escalation matrix in your output — reference it. Do NOT author documents the matrix does not call for.

Return a JSON object with this exact structure:

{
  "sizing": {
    "significance": "trivial | feature | new-service-or-api | arch-significant | business-pivot",
    "documents": ["PRD", "SDD"],
    "rationale": "one sentence citing the escalation matrix row"
  },
  "documents": [
    {
      "type": "BRD | PRD | SDD | TSD",
      "path": "{docs_root}/relative/path.md",
      "content": "full markdown of the drafted document"
    }
  ],
  "registration": [
    { "document": "PRD", "path": "{docs_root}/...", "title": "human-readable title for PROJECT.md § Design Documentation" }
  ]
}
```

---

## Constraints

- Project-agnostic — no assumptions beyond what `.claude/project-config/PROJECT.md` and the change context provide.
- Do not create worktrees, modify git config, or push. The orchestrator handles git and file placement.
- Do not duplicate the taxonomy or escalation matrix — read them from `shared/documentation-taxonomy.md`.

---

## Placeholder Reference

| Placeholder | Source | Description |
|-------------|--------|-------------|
| `{change_description}` | Orchestrator | What is being built or changed, and why |
| `{code_exploration_output_or_summary}` | `code-exploration` sub-agent | Files, interfaces, and patterns relevant to the change |
| `{repo_name}` / `{local_repo_path}` | `PROJECT.md § Repository Locations` | Target repo and its local path |
| `{profile}` | `PROJECT.md § Design Documentation` | `lite` / `standard` / `full`; default `standard` |
| `{docs_root}` | `PROJECT.md § Design Documentation` | Where authored docs are written (default `docs/`) |

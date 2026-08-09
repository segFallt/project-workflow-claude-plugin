## Update Mode

*This section is entered when Step 1 detects existing config files with `<!-- pw-version:` stamps, or when the user chose "Keep them" for legacy config files. Do NOT enter Update Mode during a Fresh Init — Fresh Init uses Steps 2–10 above.*

### U1: Status Dashboard

Read all 5 config files (if they exist). For each, report:
- **Version stamp** — the `pw-version` value, or "none (legacy file)"
- **Configured sections** — count of sections that do NOT have `<!-- not-configured -->` stubs
- **Unconfigured sections** — list of sections that still have `<!-- not-configured -->` stubs
- **Remaining placeholders** — note any `<!-- REPLACE THIS -->` markers still present
- **pw-status** — if `<!-- pw-status: not-configured -->` is present, note the file was scaffolded but not configured

Example output format:
```
### Configuration Status

| File | Version | Status | Notes |
|------|---------|--------|-------|
| PROJECT.md | 1.5.0 | 10/15 sections configured | Unconfigured: Work Item Conventions, API Endpoints, DB Schema, Cross-Cutting, Git Tags |
| STANDARDS.md | 1.5.0 | Scaffolded | Per-repo standards not yet filled in |
| TEST-MATRIX.md | 1.5.0 | Partial | 3 REPLACE THIS markers remain |
| PRD-MANIFEST.md | — | Not created | |
| .env | — | Present | API_TOKEN_ENV_VAR set |
```

### U2: Action Menu

Ask the user what they want to do (use `AskUserQuestion`):

> "What would you like to update?"
>
> Options:
> - **Add a new repository** — add a repo to PROJECT.md and all secondary config files
> - **Fill in a PROJECT.md section** — re-interview a specific section
> - **Configure a skill** — generate or reconfigure STANDARDS.md, TEST-MATRIX.md, SPEC-MANIFEST.md, or PRD-MANIFEST.md
> - **Update repository details** — edit an existing repo's tech stack, commands, or paths
> - **Refresh all** — re-interview everything (existing answers are shown as defaults)
> - **Something else** — describe what you want to change

Handle each option:

**Add a new repository:**
- Run the Phase 4 interview loop for just the new repo (name, path, role, stack, commands, paths, CI stages).
- Append a new row to the `## Repository Locations` table.
- Append a new `### {repo_name}` block under `## Tech Stacks Per Repo`.
- If a `## Repository Dependency Order` section exists and is populated, ask where the new repo fits in the order and update the table.
- If STANDARDS.md exists with `<!-- pw-version:`, append a new empty `## {repo_name}` section under `## Per-Repository Standards`.
- If TEST-MATRIX.md exists with `<!-- pw-version:`, note to the user: "TEST-MATRIX.md was not automatically updated — if this repo has a service with health endpoints, add a `## Service Health Checks` block for it manually or run `/project-workflows:init` → 'Configure a skill' → testing-static/testing-prd."
- Confirm what was updated.

**Fill in a PROJECT.md section:**
- Ask: "Which section?" (present the list of unconfigured sections from the status dashboard).
- Run the relevant interview sub-flow from Steps 4–6 for that section.
- Use `Edit` tool to replace the `<!-- not-configured -->` stub with populated content.

**Configure a skill:**
- Ask which skill (code-review / testing-static / testing-spec / testing-prd).
- Run the relevant interview sub-flow from Step 7.
- If the config file already exists with `<!-- pw-status: not-configured -->`, overwrite it entirely with the newly generated content (do not attempt to merge with the stub).
- If the config file already exists with populated content, use `Edit` tool to surgically update sections.

**Update repository details:**
- Ask: "Which repository, and what do you want to change?"
- Make surgical edits to the relevant `### {repo_name}` block in `## Tech Stacks Per Repo`, or the row in `## Repository Locations`, using `Edit` tool.

**Refresh all:**
- For each PROJECT.md section, read the current content and present it as the default, then ask if the user wants to change it.
- This is a full re-interview where each answer is pre-populated with existing content.
- **Caveat:** The agent reads back its own previously generated markdown (tables, prose) rather than a saved answer log. For structured sections like `## Tech Stacks Per Repo`, the agent will parse table rows back into answer form. This works for most content but may lose formatting nuance. Inform the user: "I'll use your current config as defaults — let me know if anything looks off."

**Something else:**
- Ask the user to describe the change. Make the edit directly.

**Gitignore check (always run in update mode):** After completing any update action, apply the **Gitignore Rule** (see File Generation Rules).

### U3: Version Mismatch

> **`pw-version` is the config-structure version, not the plugin release version.** They are deliberately decoupled: `pw-version` changes only when the config-file structure changes, whereas the plugin's release version (`plugin.json`) advances on every release. Never reconcile one to the other.

The current config-structure version is `1.5.0`. If any file's `<!-- pw-version:` stamp reads `1.0.0`, `1.0.1`, `1.2.0`, `1.3.0`, or `1.4.0`, offer to migrate it (match version strings explicitly — e.g. `reads 1.3.0` — rather than by numeric comparison, to avoid ambiguity with strings like `1.10.0`):

> "Some config files use an older structure (`{stamp}`). I can migrate them to the current structure (`1.5.0`) while preserving your content. Changes up to 1.3.0: `§ Infrastructure` → `§ Local Development` in TEST-MATRIX.md and `testing-2.md` → `testing-prd` in PRD-MANIFEST.md (from 1.0.0); and, for 1.3.0, `PROJECT.md § Design Documentation` gains `### Documentation Profile`, `### Docs Root`, and `### Spec Sources` subsections, plus a new `SPEC-MANIFEST.md` for `testing-spec`. For 1.4.0, `REVIEW-CRITERIA.md` is renamed to `STANDARDS.md` on the normalized `Category | What to check | Severity` schema (`## Universal` → `## Universal Principles`; per-repo sections gain a `Severity` column). For 1.5.0, `PROJECT.md` gains a new `## Work Item Conventions` section (after `## Domain Concepts`, with `### Hierarchy & Typing`, `### Lifecycle & Status`, and `### Comment & Body Conventions` subsections) consumed by the `work-item` skill. Would you like to migrate now?"

If yes: read the existing content, extract user-populated values by section, regenerate each file with the current structure, and update the version stamp to `1.5.0`. The Design Documentation subsections (1.3.0) add no `##` heading, but the 1.4.0→1.5.0 step **does** add one — insert `## Work Item Conventions` into `PROJECT.md` after `## Domain Concepts` (as a `<!-- not-configured -->` stub, or offer its Step 6 interview) so the file matches the 15-heading required list. For the `REVIEW-CRITERIA.md` → `STANDARDS.md` rename specifics, see the dedicated migration block below.

**Legacy `REVIEW-CRITERIA.md` → `STANDARDS.md` (1.4.0 rename):** if a `REVIEW-CRITERIA.md` is present, migrate it as part of the confirmed migration above — without this, `code-review` (which now reads `STANDARDS.md`) would find no standards file and fall back to its built-in framework, silently dropping the project's existing criteria:

- Write `.claude/project-config/STANDARDS.md` by reading the template at `skills/init/templates/STANDARDS.md` (single source), keeping its `<!-- pw-version: 1.5.0 -->` first line.
- Carry the user's content across: map the old `## Universal` rows into `## Universal Principles` on the `Category | What to check | Severity` schema, and copy each `## {repo_name}` section, adding a `Severity` column. Assign each migrated row a `Severity` floor — default the standard categories to the seed floors (Security `critical`; Generated files / Error handling / Tests / Dependencies / SOLID `warning`; Naming / Debug artifacts `suggestion`) and ask the user to pick a floor for any custom rows (default `warning`).
- Fix the legacy `SOLID` "principals" typo and drop any inline `**critical**` / prose-encoded severity markers — those move into the `Severity` column.
- Delete the old `REVIEW-CRITERIA.md` once `STANDARDS.md` is written.

**Legacy `PRD-MANIFEST.md` → `SPEC-MANIFEST.md` (user-confirmed, never automatic):** if a `PRD-MANIFEST.md` is present and no `SPEC-MANIFEST.md` exists, prompt:

> "You have a legacy `PRD-MANIFEST.md`. `testing-spec` reads the more general `SPEC-MANIFEST.md` (spec sources include `.feature` files and issues) and falls back to `PRD-MANIFEST.md` when it is absent — so no action is required. Would you like me to generate a `SPEC-MANIFEST.md` from your `PRD-MANIFEST.md` now? I will keep `PRD-MANIFEST.md` in place."

Only migrate on explicit confirmation. Generate `SPEC-MANIFEST.md` from `skills/init/templates/SPEC-MANIFEST.md`, carrying over the PRD directory (as a Spec Source), Test ID Prefixes, Feature Priorities, and Deduplication Rules. Never delete or mutate `PRD-MANIFEST.md`.

> **Maintenance note:** When the config structure changes in future, update this section with the new version, the previous versions that require migration, and the structural delta. Use explicit version string matching.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `.ci/smoke-test.sh` now resolves `./templates/`, `./references/`, and `../../shared/` pointers in `SKILL.md` files — not only `./sub-agents/` — and fails CI on any dangling relocation link (targets must exist and be non-empty), closing the pointer-validation gap ahead of the progressive-disclosure retrofits (#53).
- Retrofitted the `init` skill for progressive disclosure: `skills/init/SKILL.md` slimmed from 848 to ~344 lines by relocating on-demand detail behind pointers — the emittable PROJECT.md skeleton to `skills/init/templates/PROJECT.md` (reshaped from the former unread reference; generated PROJECT.md is byte-identical), plus `skills/init/references/{section-templates,claude-md-block,update-mode,file-generation-rules,project-md-reference}.md`. No behavioural change to init or the files it generates (#50).
- Retrofitted the `development` skill for progressive disclosure: `skills/development/SKILL.md` slimmed from 498 to ~355 lines by relocating its four output templates to `skills/development/templates/{design-document,cr-description,pipeline-status,review-feedback-report}.md` (loaded at the emitting phase) and the Error Handling matrix to `skills/development/references/error-handling.md`, with an `Output Templates` index alongside the Sub-Agent Reference. No behavioural change (#51).

## [1.7.0] - 2026-08-08

### Added

- New `work-item` skill: unifies issue **creation** (from a description) and **refinement** of existing work items toward "ready" over one shared, requirements-aware quality engine (#47).
- Shared quality-engine modules consumed by `work-item`: `shared/requirements-context.md` (requirements grounding + bidirectional cross-check), `shared/work-item-quality-lens.md` (critique taxonomy + triage-and-escalate + output shaping), and `shared/work-item-templates.md` (Bug/Feature/Task body templates + refine summary-comment template) (#47).
- `UPDATE_ISSUE` and `LIST_ISSUES` operations documented in the `gitlab-api`, `github-api`, and `gitea-api` reference skills (#47).
- New canonical `## Work Item Conventions` section in `PROJECT.md` (Hierarchy & Typing / Lifecycle & Status / Comment & Body Conventions), with an `init` interview step and Update-Mode support (#47).

### Changed

- Config-structure `pw-version` bumped `1.4.0` → `1.5.0` (adds the `## Work Item Conventions` section); `init` U3 gains the `1.4.0` → `1.5.0` migration path (#47).
- README skill count updated 12 → 13 (#47).

### Deprecated

- `issue-creation` is superseded by `work-item`. It remains **functional this release** and is scheduled for **removal in a later major version** (#47).

## [1.6.0] - 2026-08-07

### Added

- Shared, severity-graded engineering standards as a single optional project-config artifact — **`STANDARDS.md`** (supersedes `REVIEW-CRITERIA.md`), consumed as a first-class input by `issue-creation`, `development`, and `code-review` (feature #40). One merged file carries a `## Universal Principles` section plus one `## {repo}` section per repo, all on a normalized `Category | What to check | Severity` schema. The `Severity` column is read **only by `code-review`, as a floor** — a rule-mapped finding takes its row's severity as a floor the reviewer may escalate but never silently downgrade below; `issue-creation` and `development` apply every row and ignore `Severity`. The template is seeded with the 8 Universal rows (each assigned a severity floor), fixes the long-standing `SOLID` "principals" typo, and is the single source `init` reads at generation time. A `.ci/smoke-test.sh` structural check guards the template's required headings/columns, closing the `skills/init/templates/*` CI blind spot (#41).

### Changed

- `code-review` now consumes `STANDARDS.md` as an **optional** input: its rows are first-class checks in every review, each rule-mapped finding taking the row's `Severity` as a floor (escalate-only). The file is no longer required — when absent, review still runs (no hard-block) using the built-in Severity & Decision Framework. The findings/verdict schema and the `critical`/`warning` ⇒ `request_changes` decision rule are unchanged (#42).
- `issue-creation` and `development` now **actively apply** the `STANDARDS.md` principles rather than merely referencing them — factored into the drafted design (Proposed Approach / Approach), the implementation requirements (Technical Notes / design document), and seeded acceptance criteria; both consider every row and ignore `Severity`. The generic duplicated `## Constraints` bullets that mirrored these standards were consolidated to a single pointer at `STANDARDS.md` (all task-specific constraints preserved inline), skipping gracefully when the file is absent (#43).
- The `code-review` Summary Comment checklist is now **dynamic**: a single rolled-up "linked-issue acceptance criteria addressed" line (omitted when there is no linked issue) plus one row per `STANDARDS.md` category (Universal + per-repo), driven by the sub-agent's per-category output. The fixed-key checklist object and the hardcoded markdown list were converted in lockstep; a minimal built-in category set is used when `STANDARDS.md` is absent (#44).
- `init` now generates `STANDARDS.md` by **reading its template** (single source) instead of emitting an inline table — matching how `TEST-MATRIX.md` / `PRD-MANIFEST.md` / `SPEC-MANIFEST.md` are generated — with an interactive step to add or remove Universal principles. All `REVIEW-CRITERIA.md` reference sites across `init` were updated, and the config-structure `pw-version` was bumped `1.3.0` → `1.4.0` in lockstep across every generation stamp and stamped template. Update Mode migrates a legacy `REVIEW-CRITERIA.md` → `STANDARDS.md` on the new schema (renaming the file, carrying content across with severity floors, fixing the typo) so already-initialized projects don't lose their criteria after `code-review` switched to reading `STANDARDS.md` (#45).

## [1.5.0] - 2026-08-06

### Added

- New `plain-language` guidance skill (`/project-workflows:plain-language`). A user-invoked passive reference (`disable-model-invocation: true`) that steers generated prose and formatting away from patterns commonly read as LLM-written — filler vocabulary, negative parallelism, rule-of-three, over-bolding, em-dash and Title Case overuse. Documented in the README skills table (#27). The skills-count line and any `plugin.json` bump are reconciled once at release (see #37).
- `shared/documentation-taxonomy.md` — canonical, project-agnostic reference for the documentation framework (epic #28): the BRD/PRD/SDD/TSD taxonomy, the `lite`/`standard`/`full` profiles (default `standard`), and the per-change escalation matrix, each defined once as the single source of truth read by the doc-authoring sub-agent (R2), `init` profile storage (R6), and the author decision guide (R8). Foundation only — no logic (#29).
- Documentation-framework assets under `skills/documentation/` (epic #28): project-agnostic BRD/PRD/SDD/TSD templates with fill-in markers (the PRD carries a Gherkin acceptance-criteria section), a "Which Document, When" decision guide (the author-facing form of R1's escalation matrix), and a Gherkin authoring guide. Example scenarios validate against the `@cucumber/gherkin` parser. Ships with a concise `documentation` skill entry (`skills/documentation/SKILL.md`) so the skill directory is self-consistent; the full coordinator + shared doc-authoring sub-agent are wired in R2/#30. Consumed by that sub-agent (#36).
- `shared/sub-agents/doc-authoring.md` — the single owner of document sizing and authoring (epic #28): reads R1's escalation matrix, decides which docs a change needs (profile ceiling + significance floor), drafts them from the R8 templates, and writes the PRD's Gherkin acceptance criteria. Dispatched via the Agent tool by the `documentation` skill (whose `SKILL.md` is expanded into a full coordinator here) and, later, by `development` (R3/#31). Sizing/authoring logic lives only in the sub-agent — coordinators dispatch it rather than restating the matrix (#30).
- New `testing-spec` skill and the `SPEC-MANIFEST.md` schema it owns (epic #28). Generates and runs integration checks from specifications — PRDs, issues, and Gherkin `.feature` acceptance criteria — with per-check traceability to the originating scenario. `SPEC-MANIFEST.md` generalizes `PRD-MANIFEST.md` (spec sources incl. `.feature` globs, a Gherkin extraction shape, test-ID prefixes, priorities, dedup); the template file is authored by `init` in R6/#34. Gherkin parsing is optional — a Bun/Node-runnable parser/linter is used if present, else a documented inline Given/When/Then fallback, never a hard dependency. Migration-safe: falls back to a legacy `PRD-MANIFEST.md` with a one-time "consider migrating" notice and never mutates config. `testing-static` is untouched; `testing-prd` remains functional (deprecated in R7/#35) (#32).

### Changed

- Behaviour-preserving token-efficiency compaction of the skills this epic touched (epic #28): de-duplicated verified prose so each directive/step/rule is stated once and referenced. `development` factors a single Loop-exit-directive and State-reconcile block shared by Phases 5–6, collapses Sub-Agent Delegation to a reference table (incl. `doc-authoring`), drops the redundant User Interaction Points table (gates are canonical inline), and trims inline recoveries to the Error Handling table (550→497 lines). `code-review` single-sources the tracking-list-persistence, inline-comment, and activity-detection rules (297→289). The two near-identical review sub-agents now share a co-located `skills/code-review/sub-agents/_common.md` fragment, with `re-review.md` reduced to its delta (initial-review 84→28, re-review 106→58). `init` factors its repeated `<!-- not-configured -->` stanza to a single canonical marker and cross-references the required-headings list. No control-flow, output schema, check, or generated-config output changed; the 6 review keys, loop exit semantics, and 14 required headings are preserved (#38).
- Retrofitted `issue-creation`'s Bug/Feature/Task templates for Gherkin acceptance criteria (epic #28): each `## Acceptance Criteria` section now holds a `gherkin` fenced block with declarative `Scenario`/`Given`/`When`/`Then` for **behavioural** criteria (example blocks validated with `@cucumber/gherkin`), while process gates (existing tests pass, regression/unit/integration tests, docs, lint) move to a `### Definition of Done` checklist — no gate dropped. Only behaviour becomes Gherkin (#33).
- Retrofitted `development` to delegate documentation and consume Gherkin acceptance criteria (epic #28): the hardwired `## Requirements Documentation` change-type table is replaced by a single dispatch to the shared `doc-authoring` sub-agent (no doc-sizing logic duplicated); the Phase-2 Design Document is reframed as an issue-scoped implementation planner that **links to** any persisted framework SDD/TSD the sub-agent authors rather than duplicating it; and Gherkin acceptance criteria are consumed at the three correct layers — the orchestrator's test-case derivation (Given/When/Then → the cases passed to the test-writing sub-agent, which itself never parses Gherkin), the Design Document Testing Strategy, and the CR "acceptance criteria met" checklist — with source-scenario traceability. `code-review` is unchanged (#31).
- Retrofitted the `init` skill for the documentation framework (epic #28): registers a `### Documentation Profile`, `### Docs Root`, and `### Spec Sources` as `###` subsections under `PROJECT.md § Design Documentation` (no new `##` heading, so the required-headings list and `TEST-MATRIX` S-3 are unchanged); scaffolds the spec/design subtree under the existing `docs/` root without clobbering current content; authors the new `SPEC-MANIFEST.md` template (to R4's schema) and wires `testing-spec`, retaining the `PRD-MANIFEST.md` template as a legacy fallback; and adds a **user-confirmed** (never automatic) `PRD-MANIFEST → SPEC-MANIFEST` migration in Update Mode. The `pw-version` config-structure scheme is reconciled to `1.3.0` across every stamp site and stamped template, with Update-Mode migration from `1.0.0`/`1.0.1`/`1.2.0` → `1.3.0`; `pw-version` is documented as decoupled from the plugin's release version (#34).
- `code-review` skill now replies to the existing review thread for a **persisting** finding on re-review (via `REPLY_TO_CR_THREAD`) instead of opening a duplicate inline comment each round — completing the reply half of #18. Documented fallbacks (never error): a new inline comment when the line has moved and the finding no longer maps to a prior thread, or when the host lacks a threaded-reply endpoint (Gitea below 1.27). Reply/resolve are gated on host **and** Gitea version (reply ≥ 1.27, resolve ≥ 1.26); the existing resolve-on-fix behaviour is unchanged. The re-review sub-agent now emits a `threads_to_reply` mapping (#26).

### Deprecated

- `testing-prd` is deprecated in favour of `testing-spec` (epic #28). A header notice in `skills/testing-prd/SKILL.md` and its frontmatter description now point to `testing-spec`; the skill remains fully functional this release and is scheduled for removal in the next major version. Migration is non-breaking — `testing-spec` reads the general `SPEC-MANIFEST.md` and falls back to the existing `PRD-MANIFEST.md` (#35).

### Fixed

- `development` skill no longer sets upstream tracking on the first push. `shared/worktree-setup.md` and `skills/development/SKILL.md` Phase 4 now push with `git push "$PUSH_URL" {branch_name}` (no `-u`); passing the token-bearing push URL to `--set-upstream` persisted the PAT in plaintext in `.git/config` (`branch.<name>.remote`), contradicting the directive's own no-credential-persistence contract (#23). The safe named-remote example in `skills/init/templates/PROJECT.md` is unaffected.
- `gitea-api` skill now documents the real PR-review-comment endpoints instead of declaring them unsupported: §24 `REPLY_TO_CR_THREAD` uses `/pulls/{index}/comments/{id}/replies` (Gitea 1.27+), §10 `RESOLVE_CR_THREAD` uses `/pulls/comments/{id}/resolve` + `/unresolve` (1.26+), and §6 `UNAPPROVE_CR` uses `/reviews/{id}/dismissals` (1.24+) as the primary path. Each carries a minimum-version guard with a 404 fallback. §11/§25 field lists add `resolver`, `pull_request_review_id`, and the read-side `position`/`original_position` (vs create-side `new_position`/`old_position`); the §25 threading note is corrected to state replies and resolution are supported. Unblocks threaded review replies for `development` and `code-review` on Gitea (#25).
- Replaced the stale, duplicated container-registry tag guidance in `testing-static` and `testing-prd` (which hard-coded `:latest` as the main-branch tip) with a single project-agnostic `shared/testing-container-registry.md`. Both skills now reference it; the shared guidance defers the tag choice to the project's own `PROJECT.md` / release doc and cautions that `:latest` often tracks the last stable release, not the development tip (#22).

## [1.4.2] - 2026-04-21

### Changed

- Relocated runtime state directory from `.claude/project-state/` to `.state-tracking/` across `shared/state-tracking.md`, `skills/development/SKILL.md`, and `skills/code-review/SKILL.md` — pulls frequent agent writes out of `.claude/` which otherwise holds relatively static configuration data
- `init` skill Step 9 (Fresh Init) now registers `.state-tracking/` in `.gitignore` and creates the directory via `mkdir -p`; no longer registers `.claude/project-state/` (existing entries for the old path are left untouched)
- `init` skill Update Mode gitignore check updated to reference `.state-tracking/`
- `init` skill CLAUDE.md append block now includes a bullet documenting the state directory

## [1.4.1] - 2026-04-19

### Fixed

- fixed instructions for project-state tracking location for multi-repo projects

## [1.4.0] - 2026-04-19

### Added

- `shared/state-tracking.md` — new shared directive documenting the state persistence pattern: primary-repo path rule, branch-slug derivation (`/` → `-`), atomic-write bash pattern (`mktemp` + `mv -f`), Python 3 read pattern, stale-file detection (> 24h OR CR merged/closed when `cr.iid` present), corrupt-file handling (warn + delete + proceed fresh), and concurrency note
- `development` skill — Phase 1 now scans `project-state/development/*.json` to detect in-flight sessions by `issue.id`; prompts `resume / restart / cancel` for non-stale files and `delete / resume anyway / keep and cancel` for stale ones
- `development` skill — Phase 3 mid-phase recovery: if resuming with `phase=3`, checks worktree for commits after `created_at`; if found, skips to Phase 4; otherwise re-delegates implementation sub-agent using the stored design doc
- `development` skill — Phase 4 resume check: detects existing CR for the branch and jumps to Phase 5 if found
- `development` skill — state writes at: end of Phase 2 (design approved), end of Phase 4 (CR created), every Phase 5 and Phase 6 poll iteration, every `review_round` increment, every `skipped_items` append, every phase transition
- `development` skill — Phase 5 and Phase 6 loop directives now reconcile `loop.*`, `cr.*`, `worktrees`, and `skipped_items[]` from the state file at the top of each iteration (phase is never changed by mid-loop reconciliation)
- `development` skill — Phase 7 deletes the state file after worktree removal
- `code-review` skill — Phase 1 now hydrates `tracked_crs` from `tracking.json` on entry; reconciles each entry via `GET_CR`, dropping only `merged`/`closed` entries
- `code-review` skill — Phase 2 reads and writes `tracking.json` on every poll iteration; deletes the file when `tracked_crs` becomes empty
- `init` skill — Step 9 now idempotently ensures `.claude/project-state/` is present in the consuming project's `.gitignore`

## [1.3.1] - 2026-03-27

### Removed

- Removed `shared/memory-cache.md` and all memory-based config caching instructions from skill and sub-agent files (reverts !18). Config files are now always read directly from disk.

## [1.3.0] - 2026-03-27

### Added

- `shared/worktree-setup.md` — centralized directive for worktree creation, agent identity resolution (via `-c` flags), authenticated push (via `$PUSH_URL` variable), and cleanup. Replaces duplicated inline blocks.

### Changed

- code-review skill — inline comments now posted for `suggestion` findings (in addition to `critical` and `warning`). Every finding with a determinable file and line is posted inline; only `praise` remains summary-only.
- code-review skill Phase 2 — added re-review thread resolution: prior inline threads for fixed issues are resolved via `RESOLVE_CR_THREAD`; persisting/new issues get new inline comments.
- re-review sub-agent — output JSON now includes `threads_to_resolve` array for the orchestrator to resolve fixed inline threads.
- code-review skill — added `RESOLVE_CR_THREAD` to the operations used table.
- development skill Phase 3 — replaced ~60 lines of inline Worktree Identity & Remote Setup (GitLab/GitHub/Gitea blocks) with reference to `shared/worktree-setup.md`. Commit and push commands updated to use `-c` flags and `$PUSH_URL`.
- bug-fix sub-agent — now receives worktree path from orchestrator instead of creating its own. Orchestrator responsibilities documented.
- testing-static and testing-prd skills — updated bug-fix dispatch to create worktree per `shared/worktree-setup.md` before sub-agent dispatch and pass `{worktree_path}`.
- implementation and review-feedback sub-agents — added prohibition against `git config` and `git remote set-url`; use `-c` flags for identity.

### Fixed

- API reference skills (GitLab, GitHub, Gitea) — added Pagination section with host-specific loop patterns and pagination-required warnings on `GET_CR_DISCUSSIONS`, `GET_CR_COMMENTS`, and `GET_CR_DIFF` operations. Previously agents silently dropped results beyond the first page.
- development skill Phase 6 and code-review skill Phase 1/2 — added explicit pagination instructions when fetching discussions, comments, and diffs to prevent incomplete data
- development skill Phase 5 (CI monitoring) and Phase 6 (review feedback) — added explicit LOOP DIRECTIVE blocks that enumerate the only permitted exit conditions and require the agent to announce when and why it exits. Prevents silent loop termination.
- code-review skill Phase 2 (feedback monitoring) — added same LOOP DIRECTIVE pattern. Added `/loop` integration note to Phase 1 clarifying the handoff between `/loop` re-invocations and Phase 2 monitoring.
- Agent git operations no longer modify the project owner's `~/.gitconfig` or the main checkout's remote URLs. Identity and push authentication are now transient (shell variables and `-c` flags only).

## [1.2.1] - 2026-03-27

### Added

- `docs/troubleshooting/ralph-loop-hook-permission-denied.md` — troubleshooting guide for the ralph-loop stop hook "Permission denied" error (root cause, mitigation, and reinstall caveat)

## [1.2.0] - 2026-03-26

### Added

- `shared/memory-cache.md` — new shared file defining the memory-based caching protocol for all `.claude/project-config/` files. Specifies cache entry naming, entry format, read-through protocol (with `pw-version` stamp comparison for automatic invalidation), write protocol, graceful fallback, and per-skill caching table.
- Memory-cache read-through protocol applied in `shared/environment-setup.md` (for `PROJECT.md`), `skills/code-review/SKILL.md` (for `REVIEW-CRITERIA.md`), `skills/testing-static/SKILL.md` (for `TEST-MATRIX.md`), and `skills/testing-prd/SKILL.md` (for `TEST-MATRIX.md` and `PRD-MANIFEST.md`) — skills check project memory before reading config files from disk, skipping the full read on cache hits.
- Memory cache write instructions added to `skills/init/SKILL.md` — after generating or updating any config file, `init` immediately writes/overwrites the corresponding memory entry so subsequent invocations get an immediate cache hit.
- Memory-cache check instructions added to all 7 sub-agent prompt files (`code-exploration`, `bug-fix`, `implementation`, `review-feedback`, `test-writing`, `initial-review`, `re-review`) — sub-agents check project memory for `project-config-PROJECT` before reading it from disk.

## [1.1.0] - 2026-03-26

### Added

- `shared/environment-setup.md`, `shared/trunk-branch.md`, `shared/api-dispatch.md` — shared partials replacing duplicated environment-setup, trunk-branch, and API-dispatch blocks across all 5 action skills
- `shared/testing-error-handling.md`, `shared/testing-phases.md`, `shared/testing-templates.md` — shared partials replacing duplicated Phase 3/4 workflow, error-handling table, and Bug Report/CR Description templates across both testing skills
- `shared/sub-agents/code-exploration.md` — parameterized consolidation of `skills/development/sub-agents/code-exploration.md` and `skills/issue-creation/sub-agents/code-exploration.md`; `{purpose}` placeholder (`"design"` or `"issue-context"`) switches the output schema

### Changed

- All 5 action skills (`development`, `code-review`, `issue-creation`, `testing-static`, `testing-prd`) updated to reference shared partials via `Read ../../shared/{file}.md` instead of embedding duplicate content inline
- `skills/gitlab-api/SKILL.md`, `skills/github-api/SKILL.md`, `skills/gitea-api/SKILL.md` — redundant standalone endpoint code blocks removed from all operations (curl examples already contain the endpoint URL)

### Removed

- `skills/development/sub-agents/code-exploration.md` — replaced by `shared/sub-agents/code-exploration.md`
- `skills/issue-creation/sub-agents/code-exploration.md` — replaced by `shared/sub-agents/code-exploration.md`

### Fixed

- GitHub Release creation now works correctly after auto-tag pushes: `auto-tag.yml` inlines the full release process (`gh release create`) directly after pushing the version tag, working around the GitHub Actions restriction that prevents `GITHUB_TOKEN` tag pushes from triggering downstream workflows. `release.yml` has been removed as it was unreachable via the normal release path and risked creating duplicate releases on manual tag pushes.

## [1.0.4] - 2026-03-26

### Added

- `docs/contributing/releasing.md` — new dedicated contributor guide covering prerequisites, Phase 1/2 bump workflow, MR-based release steps, and troubleshooting
- `development` skill — Phase 3 worktree setup now resolves the agent's git identity from the repository host API (`GET /user`) and sets `user.name` / `user.email` scoped to the worktree; remote URL is rewritten to embed the agent's token (`oauth2:<TOKEN>@<host>`) so `git push` authenticates without system credential helpers. Branches on host type (GitLab, GitHub, Gitea) with the correct auth header and API endpoint per host. Phase 4 and Phase 6 push steps updated to note that the authenticated remote is already configured.

### Changed

- Release workflow now uses CI-automated tag creation (`auto-tag` job on both GitLab CI and GitHub Actions) instead of `git push origin main --tags`; maintainers open a release MR and CI creates the tag on both hosts on merge
- `bump-version.sh` Phase 2 no longer creates a local git tag; printed instructions updated to reflect MR-first workflow
- `README.md` "Creating a release" section replaced with a pointer to `docs/contributing/releasing.md`

## [1.0.3] - 2026-03-25

### Changed

- Enforced correct token usage across all skills: `code-review` now explicitly uses `REVIEW_TOKEN_ENV_VAR` with `API_TOKEN_ENV_VAR` fallback; all `*-api` reference skills clarify token selection per calling skill; all action skills explicitly forbid use of project-owner credentials

## [1.0.2] - 2026-03-25

### Added

- Release jobs (GitLab CI and GitHub Actions) now build and upload a `project-workflows-vX.Y.Z.tar.gz` plugin archive as a downloadable release asset; GitLab uses the Generic Package Registry, GitHub uses `softprops/action-gh-release`
- New `smoke-test` CI job (GitLab and GitHub Actions) runs `.ci/smoke-test.sh` to verify structural integrity of all skill files, sub-agent files, and cross-references on every skill/shared file change
- `README.md` now documents how to update an installed plugin (both git-URL and pinned-version workflows)
- Both release pipelines now guard against empty release notes with an explicit file-size check after CHANGELOG extraction

### Changed

- `bump-version.sh` split into two phases: Phase 1 bumps `plugin.json` and prepends a CHANGELOG template (no commit); Phase 2 (`--commit <version>`) validates no unfilled placeholder lines remain before committing and tagging
- GitLab and GitHub release jobs now source release notes from `CHANGELOG.md` via `awk` (GitHub previously used auto-generated notes from PR titles)
- `bump-version.sh` version-reading logic extracted into a `read_plugin_version()` helper to eliminate duplication between phases

## [1.0.1] - 2026-03-25

### Added

- `init` skill now features an interactive interview mode — instead of copying template files full of placeholders, it walks the user through grouped question phases and generates populated config files from their answers
- `init` skill now supports **update mode** — re-running `/project-workflows:init` on an already-configured project shows a status dashboard and lets the user update individual sections, add new repositories, or configure skills they previously skipped
- `init` skill detects legacy (non-interactive) config files and offers to replace or update them
- Config files generated by the interactive init now include a `<!-- pw-version: 1.0.1 -->` stamp on the first line, enabling update mode detection and future template version migration

### Fixed

- Aligned env var names across all skills: renamed `REPO_API_TOKEN` → `API_TOKEN_ENV_VAR` and `REVIEW_API_TOKEN` → `REVIEW_TOKEN_ENV_VAR` so that `.env.example`, `init` skill validation, and all operational skill prerequisites use consistent names
- `init` Step 4 guidance now lists `REVIEW_TOKEN_ENV_VAR` alongside `API_TOKEN_ENV_VAR`
- `.env.example` comment for `REVIEW_TOKEN_ENV_VAR` now clarifies it is consumed by the `code-review` skill
- Fixed misleading "Installing a specific version" instructions in README that caused a `Marketplace file not found` error when using a relative local path; instructions now require an absolute path
- Fixed stale `§ Infrastructure` → `§ Local Development` cross-reference in `TEST-MATRIX.md` template
- Fixed stale `testing-2.md` → `testing-prd` skill name reference in `PRD-MANIFEST.md` template
- Removed inert `pw-version` stamps from `templates/PROJECT.md` and `templates/REVIEW-CRITERIA.md` (these templates are reference-only; stamps are only meaningful in generated config files)

## [1.0.0] - 2026-03-25

### Added

- `init` skill — scaffolds project configuration files (PROJECT.md, REVIEW-CRITERIA.md, TEST-MATRIX.md, PRD-MANIFEST.md, .env.example)
- `code-review` skill — reviews all open change requests across configured repositories using a coordinator + sub-agent pattern
- `development` skill — implements features, bug fixes, or tasks from issues via exploration, implementation, and review sub-agents
- `issue-creation` skill — creates well-structured issues from problem descriptions or feature requests
- `testing-prd` skill — runs integration tests generated dynamically from PRDs
- `testing-static` skill — runs integration tests using a static test matrix
- `gitlab-api` reference skill — GitLab REST API operations (MRs, issues, notes, branches)
- `github-api` reference skill — GitHub REST API operations (PRs, issues, reviews, branches)
- `gitea-api` reference skill — Gitea REST API operations (PRs, issues, comments, branches)
- `bug-fix` shared sub-agent — reusable bug-fix workflow
- GitLab CI pipeline — validates plugin structure and skill frontmatter on changes
- GitHub Actions workflow — mirrors GitLab CI validation for GitHub-hosted mirrors

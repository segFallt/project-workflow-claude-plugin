# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

### Added

- Release jobs (GitLab CI and GitHub Actions) now build and upload a `project-workflows-vX.Y.Z.tar.gz` plugin archive as a downloadable release asset; GitLab uses the Generic Package Registry, GitHub uses `softprops/action-gh-release`
- New `smoke-test` CI job (GitLab and GitHub Actions) runs `.ci/smoke-test.sh` to verify structural integrity of all skill files, sub-agent files, and cross-references on every skill/shared file change
- `README.md` now documents how to update an installed plugin (both git-URL and pinned-version workflows)
- Both release pipelines now guard against empty release notes with an explicit file-size check after CHANGELOG extraction

### Changed

- `bump-version.sh` split into two phases: Phase 1 bumps `plugin.json` and prepends a CHANGELOG template (no commit); Phase 2 (`--commit <version>`) validates no unfilled placeholder lines remain before committing and tagging
- GitLab and GitHub release jobs now source release notes from `CHANGELOG.md` via `awk` (GitHub previously used auto-generated notes from PR titles)
- `bump-version.sh` version-reading logic extracted into a `read_plugin_version()` helper to eliminate duplication between phases

### Fixed

- Backfilled `v1.0.0` git tag against the correct initial-release commit (`2fc3b6f`)

### Added

- Release jobs (GitLab CI and GitHub Actions) now build and upload a `project-workflows-vX.Y.Z.tar.gz` plugin archive as a downloadable release asset; GitLab uses the Generic Package Registry, GitHub uses `softprops/action-gh-release`
- New `smoke-test` CI job (GitLab and GitHub Actions) runs `.ci/smoke-test.sh` to verify structural integrity of all skill files, sub-agent files, and cross-references on every skill/shared file change
- `README.md` now documents how to update an installed plugin (both git-URL and pinned-version workflows)
- Both release pipelines now guard against empty release notes with an explicit file-size check after CHANGELOG extraction

### Changed

- `bump-version.sh` split into two phases: Phase 1 bumps `plugin.json` and prepends a CHANGELOG template (no commit); Phase 2 (`--commit <version>`) validates no unfilled placeholder lines remain before committing and tagging
- GitLab and GitHub release jobs now source release notes from `CHANGELOG.md` via `awk` (GitHub previously used auto-generated notes from PR titles)
- `bump-version.sh` version-reading logic extracted into a `read_plugin_version()` helper to eliminate duplication between phases

### Fixed

- Backfilled `v1.0.0` git tag against the correct initial-release commit (`2fc3b6f`)

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

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Aligned env var names across all skills: renamed `REPO_API_TOKEN` → `API_TOKEN_ENV_VAR` and `REVIEW_API_TOKEN` → `REVIEW_TOKEN_ENV_VAR` so that `.env.example`, `init` skill validation, and all operational skill prerequisites use consistent names
- `init` Step 4 guidance now lists `REVIEW_TOKEN_ENV_VAR` alongside `API_TOKEN_ENV_VAR`
- `.env.example` comment for `REVIEW_TOKEN_ENV_VAR` now clarifies it is consumed by the `code-review` skill
- Fixed misleading "Installing a specific version" instructions in README that caused a `Marketplace file not found` error when using a relative local path; instructions now require an absolute path

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

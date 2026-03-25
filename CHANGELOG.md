# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

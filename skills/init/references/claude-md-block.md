## Project Workflows Configuration

Config directory: `.claude/project-config/`

### Config Files

- **PROJECT.md** — Central project reference: architecture, repos, tech stacks, source control settings, and worktree conventions. Fill this in first — all other files and skills reference it.
- **STANDARDS.md** — Shared, severity-graded engineering standards (Universal Principles + per-repo) used by `code-review` (as severity floors) and applied by `issue-creation` and `development`.
- **TEST-MATRIX.md** — Integration test matrix: startup sequence, infrastructure checks, service health checks, and browser tests used by the `testing-static`, `testing-spec`, and `testing-prd` skills.
- **SPEC-MANIFEST.md** — Spec discovery and extraction rules (PRDs, issues, Gherkin `.feature` files), test ID prefixes, and feature priorities used by the `testing-spec` skill.
- **PRD-MANIFEST.md** — Legacy PRD discovery rules, test ID prefixes, and feature priorities used by the `testing-prd` skill (superseded by SPEC-MANIFEST.md).
- **.env.example** — Template for environment variables. Copy to `.env` and fill in values before using operational skills.

### Available Skills

| Skill | Invocation |
|-------|------------|
| Init (onboarding & updates) | `project-workflows:init` |
| Code Review | `project-workflows:code-review` |
| Development | `project-workflows:development` |
| Issue Creation | `project-workflows:issue-creation` |
| Static Testing | `project-workflows:testing-static` |
| Spec-driven Testing | `project-workflows:testing-spec` |
| PRD-driven Testing | `project-workflows:testing-prd` |
| GitHub API reference | `project-workflows:github-api` |
| GitLab API reference | `project-workflows:gitlab-api` |
| Gitea API reference | `project-workflows:gitea-api` |

> **Note:** Fill in `PROJECT.md` first — it is the hub all other files and skills reference.

State directory (auto-created, gitignored): `.state-tracking/` — runtime state for `development` and `code-review` skills.

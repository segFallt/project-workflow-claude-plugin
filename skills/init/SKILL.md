---
name: init
description: Use when setting up a new project to use the project-workflows plugin
---

You are setting up a new project to use the `project-workflows` plugin. Follow the 4 steps below in order. Be explicit about what you are doing at each step.

---

## Step 1: Scaffold Config Files

Create the `.claude/project-config/` directory if it does not already exist. Then check each of the 5 template files individually and copy it from this skill's `templates/` directory only if it does not already exist at the destination:

- `PROJECT.md`
- `REVIEW-CRITERIA.md`
- `TEST-MATRIX.md`
- `PRD-MANIFEST.md`
- `.env.example`

For each file: if it already exists, skip it and note that it was not overwritten. If it does not exist, copy it and note that it was created.

Report which files were created and which were skipped.

---

## Step 2: Environment Validation

Check for environment variable values by reading `.claude/project-config/.env` if it exists. Do **not** attempt to read shell environment variables — only parse the `.env` file.

**Check in this order:**

1. If `.claude/project-config/.env` exists, note that it was found and parse it for variable values. If it does not exist, note that it is absent (the user will need to copy `.env.example` to `.env` before using operational skills).
2. Check whether `API_TOKEN_ENV_VAR` is defined in `.env`. If it is defined but empty, warn that it is empty. If it is absent from the file, warn that it is missing.
3. `REVIEW_TOKEN_ENV_VAR` — optional. Report whether it is set or not set; do not warn either way.
4. `REPO_HOST_URL` — required only for self-hosted instances (GitHub Enterprise, self-hosted GitLab, self-hosted Gitea). Warn if absent and the user appears to be using a self-hosted host.

**Summary:** Print a list of any warnings. If everything looks good, say so.

---

## Step 3: Update CLAUDE.md

Check if `CLAUDE.md` exists in the project root.

- If it does **not** exist: create it as an empty file first, then append the section below.
- If it **already exists**: before appending, check whether a `## Project Workflows Configuration` section heading is already present in the file. If it is, skip the append and inform the user that the section already exists — suggest they remove it manually if they want to refresh it. If it is not present, append the section below to the end of the file.

Append the following section verbatim (substituting no placeholders — this is static content):

```
## Project Workflows Configuration

Config directory: `.claude/project-config/`

### Config Files

- **PROJECT.md** — Central project reference: architecture, repos, tech stacks, source control settings, and worktree conventions. Fill this in first — all other files and skills reference it.
- **REVIEW-CRITERIA.md** — Per-repo and universal code review criteria used by the `code-review` skill.
- **TEST-MATRIX.md** — Integration test matrix: startup sequence, infrastructure checks, service health checks, and browser tests used by the `testing-static` and `testing-prd` skills.
- **PRD-MANIFEST.md** — PRD discovery rules, test ID prefixes, and feature priorities used by the `testing-prd` skill.
- **.env.example** — Template for environment variables. Copy to `.env` and fill in values before using operational skills.

### Available Skills

| Skill | Invocation |
|-------|------------|
| Init (onboarding) | `project-workflows:init` |
| Code Review | `project-workflows:code-review` |
| Development | `project-workflows:development` |
| Issue Creation | `project-workflows:issue-creation` |
| Static Testing | `project-workflows:testing-static` |
| PRD-driven Testing | `project-workflows:testing-prd` |
| GitHub API reference | `project-workflows:github-api` |
| GitLab API reference | `project-workflows:gitlab-api` |
| Gitea API reference | `project-workflows:gitea-api` |

> **Note:** Fill in `PROJECT.md` first — it is the hub all other files and skills reference.
```

Report whether CLAUDE.md was created or updated.

---

## Step 4: Print Guidance

Print the following onboarding guidance for the user:

---

### Next Steps

**1. Fill in `PROJECT.md` first.**

`PROJECT.md` is the hub that all other config files and operational skills reference. Start there before filling in any other file.

**2. Understanding the `§ Section` notation**

Throughout skill instructions and config files, you will see references like `PROJECT.md § Source Control`. This means: "the *Source Control* section of `PROJECT.md`". The `§` symbol is a section marker — it points to a named heading within a file.

**3. Config files required per skill**

| Skill | Required Config Files |
|-------|-----------------------|
| `project-workflows:code-review` | `PROJECT.md`, `REVIEW-CRITERIA.md` |
| `project-workflows:development` | `PROJECT.md` |
| `project-workflows:issue-creation` | `PROJECT.md` |
| `project-workflows:testing-static` | `PROJECT.md`, `TEST-MATRIX.md` |
| `project-workflows:testing-prd` | `PROJECT.md`, `TEST-MATRIX.md`, `PRD-MANIFEST.md` |

**4. Environment setup**

Copy `.claude/project-config/.env.example` to `.claude/project-config/.env` and fill in at minimum:
- `API_TOKEN_ENV_VAR` — your repository host personal access token (GitHub/GitLab/Gitea)
- `REVIEW_TOKEN_ENV_VAR` — optional; a separate token used only by the `code-review` skill (leave empty to reuse `API_TOKEN_ENV_VAR`)
- `REPO_HOST_URL` — only needed for self-hosted instances; leave empty for hosted GitHub.com or GitLab.com

Setup is complete. Proceed to fill in `PROJECT.md`.

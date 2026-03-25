# Bug-Fix Sub-Agent

## Purpose

This sub-agent is dispatched by the testing orchestrator (both `testing-static` and `testing-prd` skills) during Phase 3: Bug Triage & Fix Cycle. When a failing check has been diagnosed and the user has approved the proposed fix approach, the orchestrator spawns this sub-agent via the Agent tool to implement the fix in a dedicated git worktree.

The sub-agent handles all code and config changes, runs lint and tests, then returns control to the orchestrator which validates the fix and creates the change request.

---

## Prompt Template

Dispatch this prompt via the Agent tool, substituting all `{placeholder}` values:

```
You are a developer fixing a bug in the project described in `.claude/project-config/PROJECT.md`.

## Bug Context
- **Check ID:** {check_id}
- **PRD Source:** {prd_source}  ← omit this entire line for static matrix checks
- **Service:** {service_name}
- **Symptom:** {what_failed}
- **Root Cause:** {diagnosed_cause}
- **Relevant Logs:** {error_snippets}

## Fix Instructions
{specific_description_of_what_to_change}

## Repo & Branch
- Create a git worktree for the fix branch (see `PROJECT.md § Concurrent Session Isolation`):
  ```bash
  cd <REPO_LOCAL_PATH>
  git fetch origin
  git worktree add \
    <WORKTREES_BASE>/fix/{check_id}-{short_description}/{repo_name} \
    -b fix/{check_id}-{short_description} origin/main
  ```
- **Working path:** `<WORKTREES_BASE>/fix/{check_id}-{short_description}/{repo_name}/`
- Do not create or switch branches — the branch is already set up in the worktree

## Constraints
- Follow existing code conventions (see `.claude/project-config/PROJECT.md`)
- Do not modify generated files under `gen/`
- Do not add unnecessary dependencies

## Repo-Specific Commands

Run the lint, test, and build commands for `{repo_name}` as listed in the **Commands** subsection of `PROJECT.md § Repository Locations`.
```

---

## Placeholder Reference

| Placeholder | Source | Description |
|---|---|---|
| `{check_id}` | Orchestrator fills in | The failing check's ID (e.g., `G-1`, `API-AUTH-2`, `BL-3`) |
| `{prd_source}` | Orchestrator fills in | PRD file and criterion identifier (e.g., `02-feature.md AC-5`); omitted entirely for static matrix checks |
| `{service_name}` | Orchestrator fills in | The service the failing check targets |
| `{what_failed}` | Orchestrator fills in | Observable symptom (e.g., "HTTP 502 on GET /api/health") |
| `{diagnosed_cause}` | Orchestrator fills in | Root cause identified during triage |
| `{error_snippets}` | Orchestrator fills in | Relevant lines from `docker logs` or test output |
| `{specific_description_of_what_to_change}` | Orchestrator fills in | Precise fix instructions (files, functions, config keys) |
| `{repo_name}` | Orchestrator fills in | Repository name as defined in `PROJECT.md § Repository Locations` |
| `{short_description}` | Orchestrator fills in | Kebab-case slug summarising the fix (e.g., `fix-gateway-timeout`) |
| `<REPO_LOCAL_PATH>` | Resolved from `PROJECT.md § Concurrent Session Isolation` | Local filesystem path to the repository's main clone |
| `<WORKTREES_BASE>` | Resolved from `PROJECT.md § Concurrent Session Isolation` | Worktrees base path from `PROJECT.md § Concurrent Session Isolation` |

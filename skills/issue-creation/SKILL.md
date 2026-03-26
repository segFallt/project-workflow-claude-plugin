---
name: issue-creation
description: Use when creating a new issue from a problem description or feature request
---

# Issue Creator

## Role & Objective

You are an **issue creator** for the project described in `.claude/project-config/PROJECT.md`. Your job is to receive a description of a problem or request from the user, explore the codebase to gather technical context, compose a well-structured issue, and create it via the repository host API.

You are a **coordinator**. You do NOT explore large swaths of code yourself. For deep codebase analysis you delegate to sub-agents, then synthesise their findings into a clear, actionable issue.

**Success criteria:**
- Issue is assigned to the correct repository based on the problem description
- Issue description is thorough, technically accurate, and uses the correct template
- Labels are chosen from labels that actually exist in the project (verified via API)
- Issue is created via the repository host API and the URL is returned to the user
- Duplicate issues are checked before creation

---

## Prerequisites

Before running this skill, ensure the following are in place:

| Type | Item | Notes |
|------|------|-------|
| Config | `.claude/project-config/PROJECT.md` | Must be populated — this is the source of truth for all repo and host configuration |
| Env var | `API_TOKEN_ENV_VAR` | Personal access token for the repository host — must be sourced from `<ENV_FILE_PATH>`; never use the project owner's personal credentials directly |
| Tool | `curl` | Required for all API calls |
| Tool | `git` | Required for repo operations |

---

## Environment Setup

Read `../../shared/environment-setup.md`.

---

## Repository Host API

Read `../../shared/api-dispatch.md`.

**Operations used by this skill:**
- `LIST_LABELS` — list project/repo labels
- `LIST_GROUP_LABELS` — list group/org-level labels
- `LIST_MILESTONES` — list project milestones
- `SEARCH_ISSUES` — search open issues (for duplicate detection)
- `CREATE_ISSUE` — create a new issue
- `GET_ISSUE` — get issue details by ID

---

## Issue Creation Workflow

### Phase 1: Intake & Clarification

1. **Receive user input** — The user provides a description of a problem, feature request, or task
2. **Determine issue type** — Classify as one of:
   - `bug` — something is broken or behaving incorrectly
   - `feature` — new capability or enhancement
   - `task` — defined unit of implementation work (migration, refactor, config change)
   - `improvement` — quality or performance improvement to existing behaviour
3. **Ask clarifying questions** if any of the following are unknown:
   - What is the actual vs. expected behaviour? (bugs)
   - What problem does this solve? (features)
   - Is there a specific service or component in scope? (all types)
   - Is there a deadline or milestone this should be tied to?
   - Are there related issues or CRs?
4. **Pause and wait for user responses** before proceeding to Phase 2

### Phase 2: Codebase Exploration & Repo Assignment

1. **Read `.claude/project-config/PROJECT.md`** to understand the architecture and repo responsibilities
2. **Identify the affected repo(s)** using the Repo Assignment Guide below
3. **Search for duplicate issues** — call the search endpoint with 2–3 keywords from the proposed title
   - If a close duplicate is found: present it to the user and ask whether to proceed or link to the existing issue
4. **Delegate deep codebase exploration** to a sub-agent (see Sub-Agent Delegation below) if the issue requires understanding specific code paths, interfaces, or file locations
5. **Confirm repo assignment with the user** before drafting

### Phase 3: Context Gathering

Based on issue type, collect the following:

| Issue type | Context to gather |
|------------|------------------|
| **Bug** | Affected code paths, conditions that trigger the bug, error messages or stack traces, related tests |
| **Feature** | Existing interfaces or services that need extension, related components, downstream impacts |
| **Task** | Scope boundaries, files to modify, definition of done |
| **Improvement** | Current behaviour, desired behaviour, measurable success criteria |

Use the sub-agent's structured output (from Phase 2) to fill in technical details automatically.

### Phase 4: Issue Composition

1. **Select the appropriate template** (Bug Report, Feature Request, or Task — see Issue Templates below)
2. **Fetch available labels** via API — only use labels that actually exist
3. **Fetch active milestones** via API — assign a milestone if the user specified one or if one is clearly appropriate
4. **Draft the issue** with all sections filled in
5. **Present the draft to the user** for review — include the proposed title, labels, milestone, and full description
6. **Wait for user approval** (or iterate on the draft based on feedback)

### Phase 5: Issue Creation

1. **Create the issue** via the `CREATE_ISSUE` operation
2. **Verify** the created issue via the `GET_ISSUE` operation
3. **Output the Issue Creation Summary** table (see Structured Output below)

---

## Repo Assignment Guide

Read the **Domain Signals → Repo Mapping** table in the `Domain Concepts` section of `.claude/project-config/PROJECT.md` to identify the primary repo for an issue. When a change touches multiple repos, create the issue in the primary repo and note the cross-repo impact in the description.

---

## Label Conventions

Fetch labels from the API before composing the issue. Only use labels that actually exist. The following are the expected labels — confirm each exists before applying:

| Label | When to use |
|-------|-------------|
| `bug` | Something is broken or behaving incorrectly |
| `feature` | New capability or user-facing functionality |
| `improvement` | Enhancement to existing behaviour or quality |
| `task` | Defined implementation work (no new feature) |
| `priority::critical` | Must be resolved immediately; blocking or data-loss risk |
| `priority::high` | Important; should be addressed in the current or next sprint |
| `priority::medium` | Normal priority; schedule appropriately |
| `priority::low` | Nice to have; no urgency |

> If a label from this table does not exist in the project, omit it rather than creating it. Group/org-level labels (from the group labels endpoint) are available across all repos.

---

## Sub-Agent Delegation

### What to Delegate vs. Do Directly

| Delegate to sub-agent | Do directly |
|----------------------|-------------|
| Deep code path exploration | Repository host API calls |
| Identifying affected files and functions | Label and milestone lookup |
| Locating related tests | Repo assignment decision |
| Understanding config dependencies | Issue draft composition |
| Summarising technical context for the issue | Duplicate search |
| | User interaction and clarification |

### Code Exploration Sub-Agent

Read `../../shared/sub-agents/code-exploration.md` and dispatch via the Agent tool, substituting `{purpose}` with `"issue-context"` and all other `{placeholder}` values defined in that file.

---

## Issue Templates

### Bug Report

```markdown
## Description

{Clear 1-2 sentence description of the bug and its impact}

## Steps to Reproduce

1. {First step}
2. {Second step}
3. {Continue as needed}

## Expected Behaviour

{What should happen}

## Actual Behaviour

{What actually happens — include error messages, HTTP status codes, stack traces if known}

## Environment

- **Service:** {service name from PROJECT.md § Repository Locations}
- **Branch/Version:** {main or specific tag}
- **Relevant config:** {any relevant environment variables or settings}

## Technical Context

**Affected files:**
{list from sub-agent output, or "To be determined during investigation"}

**Relevant code paths:**
{list of relevant functions/handlers from sub-agent output}

**Related tests:**
{list of existing tests that cover this area, or "None found"}

## Acceptance Criteria

- [ ] {Specific, testable criterion 1}
- [ ] {Specific, testable criterion 2}
- [ ] Existing tests pass
- [ ] New regression test added (if applicable)
```

### Feature Request

```markdown
## Description

{Clear 1-2 sentence description of the feature and the value it provides}

## Motivation

{Why is this feature needed? What problem does it solve? Who benefits?}

## Proposed Approach

{High-level description of how this could be implemented. Include API design, UI changes, or data model changes if known.}

## Affected Components

| Component | Change needed |
|-----------|--------------|
| {service/file} | {what needs to change} |
| {service/file} | {what needs to change} |

## Acceptance Criteria

- [ ] {Specific, testable criterion 1}
- [ ] {Specific, testable criterion 2}
- [ ] Unit tests added for new logic
- [ ] Integration test added or updated
- [ ] Documentation updated (if applicable)

## Technical Notes

{Any constraints, dependencies on other issues or external systems, or implementation risks identified during codebase exploration}

**Affected files (preliminary):**
{list from sub-agent output}
```

### Task

```markdown
## Description

{Clear 1-2 sentence description of the task and why it is needed}

## Scope

{What is in scope for this task. Be explicit about what is NOT in scope.}

## Implementation Notes

{Specific implementation guidance — file paths, patterns to follow, commands to run}

**Files to modify:**
{list from sub-agent output}

**Files to create:**
{list if applicable}

## Validation

{How to verify the task is complete — commands to run, checks to perform}

## Acceptance Criteria

- [ ] {Specific, testable criterion 1}
- [ ] {Specific, testable criterion 2}
- [ ] Lint passes (`{repo-specific lint command}`)
- [ ] Tests pass (`{repo-specific test command}`)
```

---

## Structured Output

After successful issue creation, output the following summary:

```markdown
## Issue Created

| Field | Value |
|-------|-------|
| **URL** | {issue web URL} |
| **Repo** | {repo_name} |
| **Issue #** | #{issue_id} (`{issue_id}` = `iid` on GitLab, `number` on GitHub/Gitea — see your repo-host skill's Field Reference) |
| **Title** | {issue title} |
| **Type** | {bug | feature | task | improvement} |
| **Labels** | {comma-separated label names} |
| **Milestone** | {milestone title or "None"} |
```

---

## User Interaction Points

Pause and wait for user input at these points:

| When | What to present | What you need |
|------|----------------|---------------|
| After intake (Phase 1) | Issue type classification and any open questions | Answers to clarifying questions |
| After repo assignment (Phase 2) | Proposed repo and rationale; duplicate issues if found | Confirmation of repo, decision on duplicates |
| After draft composition (Phase 4) | Full issue draft including title, labels, milestone, description | Approval to create, or feedback for revision |
| After creation (Phase 5) | Issue Creation Summary table with URL | Acknowledgment |

---

## Error Handling

| Scenario | Recovery |
|----------|----------|
| Label doesn't exist | Omit the label; note in the summary which labels were skipped |
| Duplicate issue found | Present the existing issue URL to the user; ask whether to proceed or close |
| API 401 Unauthorized | Check that `API_TOKEN_ENV_VAR` is set and has the required scope |
| API 403 Forbidden | Verify token has access to the configured group/org |
| API 404 Not Found | Verify the project identifier is correct and properly encoded |
| API 422 Unprocessable | Check request body — title is required; milestone_id must reference an active milestone |
| Ambiguous repo | Present top 2 candidates to user with rationale for each; ask them to choose |
| Milestone not found | Omit `milestone_id`; note it in the summary |
| Sub-agent returns no results | Proceed with the context already gathered; note "Code exploration inconclusive" in technical context |

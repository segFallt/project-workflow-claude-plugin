# Work-Item Templates

Concrete body templates for composed/rewritten work items, plus the refine-mode summary comment. Referenced by `shared/work-item-quality-lens.md` (output shaping). All acceptance criteria follow `skills/documentation/templates/gherkin-guide.md`; `STANDARDS.md` references degrade gracefully when the file is absent.

## Issue-Body Templates

### Bug Report

````markdown
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

Behavioural criteria as Gherkin scenarios — declarative, one behaviour each, not UI-coupled (see `skills/documentation/templates/gherkin-guide.md`):

```gherkin
Feature: {the capability affected by the bug}

  Scenario: {the corrected behaviour}
    Given {precondition}
    When {the action or trigger}
    Then {the expected outcome, replacing the buggy one}
```

### Definition of Done

- [ ] Existing tests pass
- [ ] New regression test added (if applicable)
````

### Feature Request

````markdown
## Description

{Clear 1-2 sentence description of the feature and the value it provides}

## Motivation

{Why is this feature needed? What problem does it solve? Who benefits?}

## Proposed Approach

{High-level description of how this could be implemented. Include API design, UI changes, or data model changes if known. Reflect applicable `STANDARDS.md` principles (design cornerstones) in the approach.}

## Affected Components

| Component | Change needed |
|-----------|--------------|
| {service/file} | {what needs to change} |
| {service/file} | {what needs to change} |

## Acceptance Criteria

Behavioural criteria as Gherkin scenarios — declarative, one behaviour each, not UI-coupled (see `skills/documentation/templates/gherkin-guide.md`):

```gherkin
Feature: {the capability this feature provides}

  Scenario: {behaviour the feature enables}
    Given {precondition}
    When {the action}
    Then {the observable outcome}
```

### Definition of Done

- [ ] Unit tests added for new logic
- [ ] Integration test added or updated
- [ ] Documentation updated (if applicable)

## Technical Notes

{Any constraints, dependencies on other issues or external systems, or implementation risks identified during codebase exploration. Surface applicable `STANDARDS.md` principles as implementation requirements.}

**Affected files (preliminary):**
{list from sub-agent output}
````

### Task

````markdown
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

Behavioural criteria as Gherkin scenarios — declarative, one behaviour each, not UI-coupled (see `skills/documentation/templates/gherkin-guide.md`). Omit this block for a task with no behavioural change; the Definition of Done then carries verification.

```gherkin
Feature: {the capability this task affects}

  Scenario: {behaviour or outcome the task produces}
    Given {precondition}
    When {the action}
    Then {the expected result}
```

### Definition of Done

- [ ] Lint passes (`{repo-specific lint command}`)
- [ ] Tests pass (`{repo-specific test command}`)
````

## Refine Summary Comment

After refine mode rewrites a work-item body, post this comment on the item to record what happened. Keep it concise; omit sections with nothing to report.

```markdown
## Refinement Summary

**What changed:** {1-3 bullets summarising the substantive edits to the body}

**Findings resolved (objective):**
- {finding → how it was folded into the body}

**Open decisions surfaced:**
- {question raised to the user → the decision taken}

**Lifecycle action:** {the action taken — e.g. relabelled, linked to #{id}, split off #{id} — or "None taken" and why}
```

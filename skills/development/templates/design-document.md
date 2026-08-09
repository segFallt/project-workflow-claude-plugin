### Design Document

An **issue-scoped implementation planner** — not a persisted framework document. Frame it against the SDD/TSD tiers: when the change's significance warrants a persisted framework SDD or TSD, the `doc-authoring` sub-agent authors that document and this Design Document **links to it** rather than duplicating its content.

Present this to the user for approval before writing any code:

```markdown
## Design: #{issue_id} — {issue_title}

### Problem
{1-2 sentence technical description of what needs to change and why}

### Affected Components

| Repo | Files to modify | Files to create |
|------|----------------|----------------|
| {repo_name} | {list} | {list or "none"} |
| {repo_name} | {list} | {list or "none"} |

### Approach
{Clear description of the solution — include data flow, API contract changes, state changes, and any new abstractions. Reflect applicable `STANDARDS.md` principles (Universal + repo) in the described approach.}

### Alternatives Considered
{Brief note on any alternatives evaluated and why the chosen approach is preferred. Omit if no meaningful alternatives exist.}

### Testing Strategy
{What will be tested, at what level (unit / integration / E2E). Derive test cases from the issue's acceptance criteria — where these are Gherkin, map each `Scenario` (its `Given/When/Then`) to one or more test cases and cite the source scenario for traceability.}

### Migration / Deployment Notes
{Any migration steps, environment variable additions, or deployment order requirements. "None" if not applicable.}

### Cross-Repo Dependencies
{If multiple repos are involved, list them and the merge order per `PROJECT.md § Repository Dependency Order`. "None" if single-repo.}

### Risks
{Anything that could go wrong — breaking changes, data migrations, race conditions, rollback complexity. Note any applicable `STANDARDS.md` principle at risk (e.g., a change that could weaken error handling or test coverage). "None" if low-risk.}
```

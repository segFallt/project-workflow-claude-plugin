### CR Description

```markdown
## Summary

{1-2 sentence description of what this CR does}

Closes #{issue_id}

## Changes

- {file or component}: {what changed and why}
- {file or component}: {what changed and why}

## Design Summary

{2-3 sentence recap of the approach taken — link to design discussion in the issue if it exists}

## Testing

- [ ] Lint passes (`{repo-specific lint command}`)
- [ ] Unit tests pass
- [ ] Integration tests pass (if applicable)
- [ ] Acceptance criteria from #{issue_id} met (one line per criterion; for Gherkin acceptance criteria, cite the `Scenario` each item verifies):
  - [ ] {criterion 1 — or "Scenario: {name}"}
  - [ ] {criterion 2 — or "Scenario: {name}"}

## Screenshots

{For frontend/UI repo changes: before/after screenshots or "N/A"}

## Related

- Issue: #{issue_id}
- {Any related CRs in other repos, e.g., "Depends on <GROUP>/<upstream-repo> {cr_reference}"}
```

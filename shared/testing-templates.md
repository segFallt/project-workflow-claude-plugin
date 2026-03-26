### Bug Report (for each FAIL)

```markdown
### Bug: {check_id} — {short_title}

**Severity:** {critical | high | medium | low}
**Service:** {service_name}
**Symptom:** {what the user would observe}
**Root cause:** {technical explanation}
**Proposed fix:** {what needs to change and where}
**Files to modify:** {list of file paths}
```

### CR Description Template

```markdown
## Summary
Fix {check_id}: {one-line description}

## Root Cause
{technical explanation of what was wrong}

## Changes
- {bullet per file changed with brief description}

## Testing
- [ ] Re-ran check {check_id} — now PASS
- [ ] Lint passes
- [ ] Unit tests pass
- [ ] No regressions in related checks

## Related
- Test cycle: #{n}
- Check ID: {check_id}
```

### Pipeline Status Report

Output this when reporting CI results to the user:

```markdown
## Pipeline Status — {repo_name} CR {cr_reference}

| Stage | Job | Status | Duration |
|-------|-----|--------|----------|
| {stage} | {job_name} | ✅ passed / ❌ failed / ⏳ running | {duration}s |
| {stage} | {job_name} | ✅ passed / ❌ failed / ⏳ running | {duration}s |

**Overall:** {success | failed | running}

{If failed:}
### Failure Details

**Job:** {job_name}
**Stage:** {stage_name}
**Error:**
\`\`\`
{relevant excerpt from job log trace — last 30–50 lines}
\`\`\`

**Diagnosis:** {root cause in 1-2 sentences}
**Proposed fix:** {what needs to change}
```

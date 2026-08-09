### Review Feedback Report

Present this to the user when new review feedback is detected, before delegating fixes:

```markdown
## Review Feedback — {repo_name} CR {cr_reference} (Round {review_round} of {max_review_rounds})

**Unresolved discussions:** {total_count}
**New since last check:** {new_count}

| # | File | Line | Reviewer | Comment (summary) |
|---|------|------|----------|-------------------|
| 1 | {position.new_path} | {position.new_line} | {author_name} | {first 100 chars of comment} |
| 2 | {position.new_path} | {position.new_line} | {author_name} | {first 100 chars of comment} |

### Proposed Approach
{For each discussion, one sentence describing the intended fix. Flag any that seem unclear or potentially contentious.}

**Shall I proceed with these fixes?**
```

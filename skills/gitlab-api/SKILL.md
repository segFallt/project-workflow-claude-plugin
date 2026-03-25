---
name: gitlab-api
description: Use when making GitLab REST API calls — provides curl patterns for MRs, issues, notes, and branch operations
---

# GitLab REST API Reference

This document maps standardized operation names to their GitLab REST API equivalents. Action prompts reference these operations by name (e.g., `CREATE_CR`, `POST_CR_COMMENT`) instead of embedding inline curl examples.

---

## Authentication

Token header: `PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>`

Load from `<ENV_FILE_PATH>`:
```bash
source <ENV_FILE_PATH>
export PRIVATE_TOKEN=$<API_TOKEN_ENV_VAR>
```

curl base:
```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/..."
```

For POST/PUT requests, add `-H "Content-Type: application/json"` and `-d '{...}'`.

---

## Terminology Mapping

| Generic Term | GitLab Term |
|---|---|
| Change Request (CR) | Merge Request (MR) |
| CR ID | MR IID (`iid`, not `id`) |
| CR reference | `!{iid}` |
| Comment | Note |
| Comment thread | Discussion |
| CI Pipeline | Pipeline |
| Check / Job | Job |
| Approve CR | Approve MR |
| Repository | Project |
| Base branch | Target branch (`target_branch`) |
| Head branch | Source branch (`source_branch`) |
| Issue reference | `#{iid}` |

---

## Project/Repo Identification

GitLab identifies projects by **URL-encoded path** or **numeric project ID**.

- A project at `<GROUP>/my-service` is referenced as `<GROUP>%2Fmy-service` in API URLs.
- Use `<GROUP>%2F{repo_name}` in API paths throughout this document.
- Numeric project IDs (from `project_id` in responses) can also be used interchangeably in place of the encoded path.

Example:
```
# Using URL-encoded path
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2Fmy-service/merge_requests

# Using numeric project ID
GET <API_BASE_URL>/api/v4/projects/42/merge_requests
```

---

## API Operations

### 1. LIST_OPEN_CRS

List all open merge requests for the group.

```
GET <API_BASE_URL>/api/v4/groups/<GROUP>/merge_requests?state=opened&per_page=100
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/groups/<GROUP>/merge_requests?state=opened&per_page=100"
```

**Key response fields:** `iid`, `project_id`, `title`, `author`, `source_branch`, `target_branch`, `draft`, `updated_at`, `web_url`, `has_conflicts`, `changes_count`.

---

### 2. GET_CR

Get merge request details, including `diff_refs`.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}"
```

**Key response fields:** `iid`, `title`, `description`, `state` (`opened`, `closed`, `merged`), `source_branch`, `target_branch`, `merge_status`, `has_conflicts`, `detailed_merge_status`, `diff_refs` (`base_sha`, `head_sha`, `start_sha`), `updated_at`, `web_url`.

---

### 3. GET_CR_DIFF

Get MR changes (full diff).

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/changes
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/changes"
```

**Key response fields:** Returns the MR object with an additional `changes` array. Each change has `old_path`, `new_path`, `diff` (unified diff string), `new_file`, `renamed_file`, `deleted_file`.

---

### 4. CREATE_CR

Create a new merge request.

```
POST <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests
```

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{
    "source_branch": "{feature_branch}",
    "target_branch": "main",
    "title": "{MR title}",
    "description": "{MR description}",
    "remove_source_branch": true
  }' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests"
```

**Key response fields:** `iid`, `web_url`, `state`, `source_branch`, `target_branch`.

---

### 5. APPROVE_CR

Approve a merge request.

```
POST <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/approve
```

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/approve"
```

**Key response fields:** `approved`, `approved_by`.

---

### 6. UNAPPROVE_CR

Remove approval from a merge request.

```
POST <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/unapprove
```

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/unapprove"
```

**Key response fields:** `approved`, `approved_by`, `approvals_required`, `approvals_left`.

---

### 7. MERGE_CR

Merge a merge request.

```
PUT <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/merge
```

```bash
curl -s -X PUT \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/merge"
```

**Key response fields:** `state` (should become `merged`), `merged_by`, `merged_at`, `web_url`.

---

### 8. POST_CR_COMMENT

Post a general comment (note) on a merge request.

```
POST <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/notes
```

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{"body": "{comment text}"}' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/notes"
```

**Key response fields:** `id`, `body`, `author`, `created_at`.

---

### 9. POST_CR_INLINE_COMMENT

Post an inline discussion thread on a specific line in the diff.

```
POST <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions
```

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "{comment text}",
    "position": {
      "position_type": "text",
      "base_sha": "{diff_refs.base_sha}",
      "head_sha": "{diff_refs.head_sha}",
      "start_sha": "{diff_refs.start_sha}",
      "old_path": "{file path before change}",
      "new_path": "{file path after change}",
      "new_line": {line_number_in_new_file}
    }
  }' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions"
```

See the **Inline Comment Position Object** section below for full details on the `position` field.

**Key response fields:** `id` (discussion ID), `notes[0].id`, `notes[0].body`, `notes[0].position`.

---

### 10. RESOLVE_CR_THREAD

Resolve a discussion thread.

```
PUT <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions/{discussion_id}
```

```bash
curl -s -X PUT \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{"resolved": true}' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions/{discussion_id}"
```

**Key response fields:** `id`, `notes[].resolved`.

---

### 11. GET_CR_COMMENTS

List all notes (comments) on a merge request.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/notes?per_page=100
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/notes?per_page=100"
```

**Key response fields:** Array of note objects with `id`, `body`, `author`, `created_at`, `updated_at`, `system` (boolean, true for system-generated notes).

---

### 12. GET_CR_LINKED_ISSUES

Get issues that will be closed when the MR is merged.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/closes_issues
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/closes_issues"
```

**Key response fields:** Array of issue objects with `iid`, `title`, `description`, `labels`, `web_url`.

---

### 13. GET_CR_PIPELINES

Get pipeline status for a merge request.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/pipelines
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/pipelines"
```

**Key response fields:** Array of pipeline objects with `id`, `status` (`running`, `pending`, `success`, `failed`, `canceled`), `web_url`.

---

### 14. GET_PIPELINE_JOBS

List all jobs in a pipeline.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/pipelines/{pipeline_id}/jobs
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/pipelines/{pipeline_id}/jobs"
```

**Key response fields:** Array of job objects with `id`, `name`, `stage`, `status`, `duration`, `web_url`.

---

### 15. GET_JOB_LOG

Get raw log output for a job.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/jobs/{job_id}/trace
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/jobs/{job_id}/trace"
```

**Response:** Raw plain text of the job log. Read the tail for error messages in failed jobs.

---

### 16. GET_ISSUE

Get issue details.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues/{issue_iid}
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues/{issue_iid}"
```

**Key response fields:** `iid`, `title`, `description`, `labels`, `milestone`, `state`, `assignees`, `web_url`.

---

### 17. CREATE_ISSUE

Create a new issue.

```
POST <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues
```

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "{issue title}",
    "description": "{issue description}",
    "labels": "{comma-separated label names}",
    "milestone_id": {milestone_id}
  }' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues"
```

**Key response fields:** `iid`, `web_url`, `title`, `labels`, `milestone`.

---

### 18. CLOSE_ISSUE

Close an issue.

```
PUT <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues/{issue_iid}
```

```bash
curl -s -X PUT \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{"state_event": "close"}' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues/{issue_iid}"
```

**Key response fields:** `iid`, `state` (should become `closed`), `web_url`.

---

### 19. LIST_LABELS

List available labels for a project.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/labels
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/labels"
```

**Key response fields:** Array of label objects with `name`, `color`, `description`.

---

### 20. LIST_GROUP_LABELS

List group-level labels that apply across all repos in the group.

```
GET <API_BASE_URL>/api/v4/groups/<GROUP>/labels
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/groups/<GROUP>/labels"
```

**Key response fields:** Array of label objects with `name`, `color`, `description`.

---

### 21. LIST_MILESTONES

List active milestones for a project.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/milestones?state=active
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/milestones?state=active"
```

**Key response fields:** Array of milestone objects with `id`, `iid`, `title`, `due_date`.

---

### 22. SEARCH_BRANCHES

Search for branches matching a query.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/repository/branches?search={query}
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/repository/branches?search={query}"
```

**Key response fields:** Array of branch objects with `name`, `commit.id`, `commit.message`, `merged`, `protected`.

---

### 23. POST_ISSUE_COMMENT

Post a comment (note) on an issue.

```
POST <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues/{issue_iid}/notes
```

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{"body": "{comment text}"}' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues/{issue_iid}/notes"
```

**Key response fields:** `id`, `body`, `author`, `created_at`.

---

### 24. REPLY_TO_CR_THREAD

Reply to an existing discussion thread on a merge request.

```
POST <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions/{discussion_id}/notes
```

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{"body": "{reply text}"}' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions/{discussion_id}/notes"
```

**Key response fields:** `id`, `body`, `author`, `created_at`.

---

### 25. GET_CR_DISCUSSIONS

List all threaded discussions on a merge request.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions?per_page=100
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions?per_page=100"
```

**Key response fields:** Array of discussion objects. Each has `id`, `notes[]` (array of note objects with `id`, `body`, `author`, `created_at`, `updated_at`, `resolvable`, `resolved`, `position`). The `position` field is present for inline comment threads and contains `new_path` and `new_line`.

---

### 26. SEARCH_ISSUES

Search for issues by keyword.

```
GET <API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues?state=opened&search={query}
```

```bash
curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/issues?state=opened&search={query}"
```

Search with 2-3 keywords from the issue title. Returns open issues with matching content.

**Key response fields:** Array of issue objects with `iid`, `title`, `description`, `labels`, `state`, `web_url`.

---

## Inline Comment Position Object

The `position` object is required when posting inline comments via `POST_CR_INLINE_COMMENT`. It tells GitLab exactly which line of which file to attach the comment to.

### Obtaining `diff_refs`

First, call `GET_CR` to retrieve the merge request details. The response includes a `diff_refs` object:

```json
{
  "diff_refs": {
    "base_sha": "abc123...",
    "head_sha": "def456...",
    "start_sha": "ghi789..."
  }
}
```

### Position Object Structure

```json
{
  "position_type": "text",
  "base_sha": "<from diff_refs.base_sha>",
  "head_sha": "<from diff_refs.head_sha>",
  "start_sha": "<from diff_refs.start_sha>",
  "old_path": "<file path before change>",
  "new_path": "<file path after change>",
  "new_line": "<line number in new version of file>",
  "old_line": "<line number in old version of file>"
}
```

### Line Targeting Rules

| Change Type | Set `new_line` | Set `old_line` | Notes |
|---|---|---|---|
| Added line | Yes | No | Line exists only in the new version |
| Removed line | No | Yes | Line exists only in the old version |
| Unchanged (context) line | Yes | Yes | Line exists in both versions |

### Complete Example

```bash
curl -s -X POST \
  -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "This variable should be declared as `const` since it is never reassigned.",
    "position": {
      "position_type": "text",
      "base_sha": "abc123def456abc123def456abc123def456abcd",
      "head_sha": "def456abc123def456abc123def456abc123defg",
      "start_sha": "789abc123def456abc123def456abc123def456ab",
      "old_path": "src/handler.js",
      "new_path": "src/handler.js",
      "new_line": 42
    }
  }' \
  "<API_BASE_URL>/api/v4/projects/<GROUP>%2F{repo_name}/merge_requests/{mr_iid}/discussions"
```

---

## Field Reference

| Field | Type | Description |
|---|---|---|
| `iid` | integer | Project-scoped issue/MR number (use this in API paths, not `id`) |
| `id` | integer | Global unique ID across the entire GitLab instance (rarely needed in API paths) |
| `project_id` | integer | Numeric project ID; can substitute for URL-encoded path in API URLs |
| `web_url` | string | Full URL to view the MR/issue in a browser |
| `source_branch` | string | Head branch name (the branch being merged) |
| `target_branch` | string | Base branch name (the branch being merged into) |
| `diff_refs` | object | Contains `base_sha`, `head_sha`, `start_sha` for positioning inline comments |
| `has_conflicts` | boolean | Whether the MR has merge conflicts with the target branch |
| `draft` | boolean | Whether the MR is marked as a draft |
| `state` | string | Current state: `opened`, `closed`, or `merged` (MRs); `opened` or `closed` (issues) |
| `merge_status` | string | Merge readiness: `can_be_merged`, `cannot_be_merged`, `unchecked` |
| `detailed_merge_status` | string | More granular merge status with specific blocking reasons |
| `changes_count` | string | Number of changed files in the MR (returned as a string) |
| `author` | object | User object with `id`, `username`, `name`, `avatar_url` |
| `labels` | array | Array of label strings applied to the issue/MR |
| `milestone` | object | Milestone object with `id`, `iid`, `title`, `due_date` |
| `updated_at` | string | ISO 8601 timestamp of the last update |
| `created_at` | string | ISO 8601 timestamp of creation |
| `description` | string | Body text of the MR or issue (Markdown) |
| `resolved` | boolean | Whether a discussion thread or note is resolved |
| `resolvable` | boolean | Whether a note can be resolved |
| `system` | boolean | Whether a note was auto-generated by GitLab (e.g., status changes) |
| `position` | object | For inline notes: contains `new_path`, `new_line`, `old_path`, `old_line`, `position_type` |

---
name: gitea-api
description: Use when making Gitea REST API calls — provides curl patterns for PRs, issues, comments, and branch operations
---

# Gitea REST API Reference

This document maps standardized operation names to their Gitea REST API equivalents. Action prompts reference these operations by name (e.g., `CREATE_CR`, `POST_CR_COMMENT`) instead of embedding inline curl examples.

---

## Authentication

Token header: `Authorization: token $<API_TOKEN_ENV_VAR>`

Load from `<ENV_FILE_PATH>`:
```bash
source <ENV_FILE_PATH>
export GITEA_TOKEN=$<API_TOKEN_ENV_VAR>
```

curl base:
```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  "<INSTANCE_URL>/api/v1/..."
```

For POST/PUT/PATCH requests, add `-X POST` (or `-X PATCH`, etc.) and `-d '{...}'`.

> **Note:** Gitea uses `Authorization: token {PAT}` — not `Bearer`. Basic authentication is also supported via `Authorization: Basic {base64(username:password)}`. Gitea is self-hosted, so the base URL is always `<INSTANCE_URL>/api/v1` (there is no central `api.gitea.com` host). Replace `<INSTANCE_URL>` with the actual Gitea instance URL (e.g., `https://gitea.example.com`).

> The token variable name depends on the calling skill. Code-review agents use
> `REVIEW_TOKEN_ENV_VAR`; all other agents use `API_TOKEN_ENV_VAR`. Substitute
> the correct variable wherever `<API_TOKEN_ENV_VAR>` appears in the examples below.

---

## Terminology Mapping

| Generic Term | Gitea Term |
|---|---|
| Change Request (CR) | Pull Request (PR) |
| CR ID | PR index (`number`) |
| CR reference | `#{number}` |
| Comment | Comment |
| Comment thread | Review comment thread |
| CI Pipeline | Gitea Actions workflow run / Commit status |
| Check / Job | Actions job / Status check |
| Approve CR | Review with `event=APPROVED` |
| Repository | Repository |
| Base branch | Base branch (`base.label`) |
| Head branch | Head branch (`head.label`) |
| Issue reference | `#{number}` |
| Group | Organization (`org`) |
| Owner | Owner (user or organization) |

> **Note:** Gitea field names are largely GitHub-compatible. The PR number is available as `number` on pull request objects. Some internal APIs may reference `index` — both refer to the same integer PR identifier within a repo.

---

## Project/Repo Identification

Gitea identifies repositories by **owner** and **repo name** in the URL path: `{owner}/{repo}`.

- `<OWNER>` is a Gitea user or organization name. No URL-encoding is needed.
- Use `<OWNER>/{repo_name}` in API paths throughout this document.

Example:
```
# Using owner/repo
GET <INSTANCE_URL>/api/v1/repos/<OWNER>/my-service/pulls

# All endpoints follow this pattern
GET <INSTANCE_URL>/api/v1/repos/<OWNER>/my-service/issues
```

> **Key difference from GitHub:** Gitea is self-hosted, so all URLs start with `<INSTANCE_URL>/api/v1` instead of `https://api.github.com`. The `{owner}/{repo}` path format is the same.

---

## API Operations

### 1. LIST_OPEN_CRS

List all open pull requests for a repository.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls?state=open&limit=50"
```

> **Note:** Gitea does not have a single endpoint to list PRs across an entire organization. To list PRs across multiple repos, query each repo individually. Pagination uses `page` and `limit` query parameters (default `limit=50`, max varies by instance config).

**Key response fields:** `number`, `title`, `user`, `head.label`, `base.label`, `updated_at`, `html_url`, `mergeable`, `state`.

---

### 2. GET_CR

Get pull request details.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}"
```

**Key response fields:** `number`, `title`, `body`, `state` (`open`, `closed`), `head.label`, `base.label`, `head.sha`, `mergeable`, `updated_at`, `html_url`, `merged`, `merge_commit_sha`, `changed_files`, `additions`, `deletions`.

---

### 3. GET_CR_DIFF

Get PR changed files with patch data.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/files?limit=100"
```

**Key response fields:** Array of file objects with `filename`, `status` (`added`, `removed`, `modified`, `renamed`), `additions`, `deletions`, `changes`, `contents_url`, `previous_filename` (for renames).

> **Note:** To get the raw unified diff, request the diff directly: `GET <INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}.diff` (returns plain-text diff).

---

### 4. CREATE_CR

Create a new pull request.

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "head": "{feature_branch}",
    "base": "main",
    "title": "{PR title}",
    "body": "{PR description}"
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls"
```

**Key response fields:** `number`, `html_url`, `state`, `head.label`, `base.label`.

---

### 5. APPROVE_CR

Approve a pull request by submitting a review with `APPROVED` event.

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "APPROVED"
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews"
```

**Key response fields:** `id` (review ID), `state` (`APPROVED`), `user`, `html_url`.

---

### 6. UNAPPROVE_CR

> **Limitation:** Gitea does not have a dedicated "unapprove" or "dismiss review" endpoint in the REST API. To effectively override a previous approval, submit a new review with a different event.

**Workaround — submit a new review with `REQUEST_CHANGES`:**

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "REQUEST_CHANGES",
    "body": "Withdrawing previous approval — changes needed."
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews"
```

> **Note:** This does not remove the original approval review — it adds a new review that supersedes it. Gitea considers the latest review from each user as the effective review state. Alternatively, you can delete a specific review if you have admin permissions: `DELETE /api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews/{review_id}`.

**Key response fields:** `id`, `state` (`REQUEST_CHANGES`), `user`.

---

### 7. MERGE_CR

Merge a pull request.

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "Do": "squash"
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/merge"
```

**Key response fields:** Returns empty body on success (HTTP 200). Verify by re-fetching the PR — `merged` should be `true`.

> **Note:** The `Do` field specifies the merge method: `merge` (default), `squash`, `rebase`, or `rebase-merge`. You can optionally include `merge_message_field` for a custom merge commit message.

---

### 8. POST_CR_COMMENT

Post a general comment on a pull request. In Gitea, PRs are also issues, so general comments use the issues endpoint.

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"body": "{comment text}"}' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/issues/{index}/comments"
```

> **Key quirk:** Gitea treats PRs as a special type of issue (same as GitHub). General (non-inline) PR comments use the **issues** comments endpoint. Inline code comments use the pulls review endpoint (see `POST_CR_INLINE_COMMENT`).

**Key response fields:** `id`, `body`, `user`, `created_at`, `html_url`.

---

### 9. POST_CR_INLINE_COMMENT

Post inline review comments on specific lines in the diff. Gitea requires submitting a review with a `comments` array.

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "Review summary (optional)",
    "event": "COMMENT",
    "comments": [
      {
        "path": "path/to/file.go",
        "new_position": 42,
        "body": "Inline comment on this line."
      }
    ]
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews"
```

See the **Inline Comment Position Object** section below for full details on positioning fields.

**Key response fields:** `id` (review ID), `body`, `user`, `comments` (array of inline comment objects, each with `id`, `body`, `path`).

---

### 10. RESOLVE_CR_THREAD

> **Limitation:** Gitea does not support marking review comment threads as resolved via the REST API. There is no equivalent endpoint or GraphQL workaround.

**Workaround:** Post a reply acknowledging the thread is addressed (via `POST_CR_COMMENT` or by adding a comment to the review). The thread will not be visually marked as "resolved" in the Gitea UI, but the reply serves as an acknowledgment.

---

### 11. GET_CR_COMMENTS

Get all comments on a pull request. Gitea stores general comments and inline review comments in separate endpoints — query both.

**General comments (issue comments):**
```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/issues/{index}/comments"
```

**Inline review comments (per review):**
```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews/{review_id}/comments"
```

> **Note:** To get all inline comments across all reviews, first list reviews via `GET_CR_DISCUSSIONS`, then fetch comments for each review using the endpoint above.

**Key response fields (general):** Array of comment objects with `id`, `body`, `user`, `created_at`, `updated_at`, `html_url`.

**Key response fields (review comments):** Array of review comment objects with `id`, `body`, `user`, `path`, `created_at`, `updated_at`.

---

### 12. GET_CR_LINKED_ISSUES

Get issues that will be closed when the PR is merged.

> **Important:** Gitea does not have a dedicated REST API endpoint for listing linked/closing issues. Issue links are established through keywords in the PR body or commit messages (same as GitHub).

**Approach:** Parse the PR `body` field (from `GET_CR`) for closing keyword patterns:
- `Closes #N`
- `Fixes #N`
- `Resolves #N`

These keywords are case-insensitive and can also reference cross-repo issues: `Closes owner/repo#N`.

```bash
# 1. Get the PR body
PR_BODY=$(curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}" | jq -r '.body')

# 2. Extract issue numbers from closing keywords
echo "$PR_BODY" | grep -oiE '(closes|fixes|resolves)\s+#[0-9]+' | grep -oE '#[0-9]+'
```

---

### 13. GET_CR_PIPELINES

Get CI status for a pull request's head commit.

**Commit statuses (external CI or Gitea Actions):**
```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/statuses/{head_sha}"
```

Obtain `{head_sha}` from `GET_CR` response field `head.sha`.

**Key response fields:** Array of status objects, each with `id`, `state` (`pending`, `success`, `error`, `failure`, `warning`), `description`, `target_url`, `context`, `created_at`.

**Alternative — Gitea Actions tasks:**
> **Note:** Commit statuses are posted by CI systems (including Gitea Actions). The `context` field identifies which CI pipeline the status belongs to. Use the combined status endpoint for a summary: `GET /api/v1/repos/<OWNER>/{repo_name}/commits/{sha}/status`.

---

### 14. GET_PIPELINE_JOBS

List jobs in a Gitea Actions workflow run.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/actions/runs/{run_id}/jobs"
```

> **Note:** This endpoint is available when using Gitea Actions (built-in CI). To find the `run_id`, list workflow runs: `GET /api/v1/repos/<OWNER>/{repo_name}/actions/runs`.

**Key response fields:** Array of job objects with `id`, `name`, `status`, `conclusion`, `started_at`, `completed_at`, `html_url`, `steps[]`.

---

### 15. GET_JOB_LOG

Get log output for a Gitea Actions workflow run.

```bash
curl -s -L -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -o job_logs.zip \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/actions/runs/{run_id}/logs"
```

> **Important:** This endpoint returns a **ZIP file** containing log files, not plain text. You must download and extract the archive to read individual job logs. Use `-o` to save the file, then extract with `unzip`.

```bash
# Download and extract logs
curl -s -L -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -o /tmp/logs.zip \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/actions/runs/{run_id}/logs"

unzip -o /tmp/logs.zip -d /tmp/job_logs/
# Read the extracted log files
cat /tmp/job_logs/*.txt
```

---

### 16. GET_ISSUE

Get issue details.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/issues/{index}"
```

**Key response fields:** `number`, `title`, `body`, `labels`, `milestone`, `state`, `assignees`, `html_url`.

> **Note:** Gitea's issues endpoint also returns pull requests (since PRs are issues). You can distinguish them by the presence of the `pull_request` field in the response.

---

### 17. CREATE_ISSUE

Create a new issue.

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "{issue title}",
    "body": "{issue description}",
    "labels": [{label_id_1}, {label_id_2}],
    "milestone": {milestone_id}
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/issues"
```

> **Key difference from GitHub:** Gitea's `labels` field takes an array of **integer label IDs**, not label name strings. The `milestone` field takes the milestone **ID** (integer). Use `LIST_LABELS` and `LIST_MILESTONES` to look up IDs first.

**Key response fields:** `number`, `html_url`, `title`, `labels`, `milestone`.

---

### 18. CLOSE_ISSUE

Close an issue.

```bash
curl -s -X PATCH \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"state": "closed"}' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/issues/{index}"
```

**Key response fields:** `number`, `state` (should become `closed`), `html_url`.

---

### 19. LIST_LABELS

List available labels for a repository.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/labels?limit=50"
```

**Key response fields:** Array of label objects with `id`, `name`, `color`, `description`.

> **Note:** Unlike GitHub, Gitea requires label **IDs** (not names) when assigning labels to issues or PRs.

---

### 20. LIST_GROUP_LABELS

List organization-level labels.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/orgs/<OWNER>/labels?limit=50"
```

> **Note:** Gitea natively supports organization-level labels — unlike GitHub, which has no org-label endpoint. Org labels are available to all repos within the organization.

**Key response fields:** Array of label objects with `id`, `name`, `color`, `description`.

---

### 21. LIST_MILESTONES

List active milestones for a repository.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/milestones?state=open&limit=50"
```

**Key response fields:** Array of milestone objects with `id`, `title`, `due_on`, `state`, `open_issues`, `closed_issues`.

---

### 22. SEARCH_BRANCHES

Search for branches matching a pattern.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/branches?q={query}&limit=50"
```

> **Note:** Gitea supports the `q` query parameter for branch filtering — unlike GitHub's REST API, which requires client-side filtering. The `q` parameter performs a substring match on branch names.

**Key response fields:** Array of branch objects with `name`, `commit.id` (SHA), `commit.url`, `protected`.

---

### 23. POST_ISSUE_COMMENT

Post a comment on an issue. Uses the same endpoint as `POST_CR_COMMENT` since PRs are issues in Gitea.

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"body": "{comment text}"}' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/issues/{index}/comments"
```

**Key response fields:** `id`, `body`, `user`, `created_at`, `html_url`.

---

### 24. REPLY_TO_CR_THREAD

> **Limitation:** Gitea does not support direct thread replies in the REST API. There is no endpoint to reply to a specific review comment within its thread.

**Workaround — add a new review comment or issue comment:**

Option A — Submit a new review with an inline comment on the same file/line:
```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "",
    "event": "COMMENT",
    "comments": [
      {
        "path": "{same_file_path}",
        "new_position": {same_line_number},
        "body": "{reply text}"
      }
    ]
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews"
```

Option B — Post a general PR comment referencing the original comment:
```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"body": "Re: {file}:{line} — {reply text}"}' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/issues/{index}/comments"
```

> **Note:** Neither workaround creates a threaded reply in the Gitea UI. Option A places the comment on the same line (closest to a thread reply). Option B posts a general comment.

---

### 25. GET_CR_DISCUSSIONS

Get all reviews (with their comments) on a pull request.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews"
```

**Key response fields:** Array of review objects, each with `id`, `body`, `state` (`APPROVED`, `REQUEST_CHANGES`, `COMMENT`), `user`, `html_url`, `submitted_at`.

**To get inline comments for a specific review:**
```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews/{review_id}/comments"
```

**Key response fields (review comments):** Array of comment objects with `id`, `body`, `path`, `user`, `created_at`, `updated_at`.

> **Threading model:** Gitea reviews are the primary grouping mechanism. Each review contains zero or more inline comments. To reconstruct discussions, iterate through all reviews and their comments. Unlike GitHub, there is no `in_reply_to_id` threading within review comments.

---

### 26. SEARCH_ISSUES

Search for issues by keyword.

```bash
curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/issues?type=issues&state=open&q={query}&limit=50"
```

Search with 2-3 keywords from the issue title. Use `type=issues` to exclude pull requests from results. Use `type=pulls` to search only pull requests.

> **Note:** The `q` parameter performs a keyword search on issue titles and bodies. Unlike GitHub's global search API, this searches within a single repository only.

**Key response fields:** Array of issue objects, each with `number`, `title`, `body`, `labels`, `state`, `html_url`.

---

## Inline Comment Position Object

The position fields are required when posting inline comments via `POST_CR_INLINE_COMMENT`. They tell Gitea exactly which line of which file to attach the comment to. Inline comments are submitted as part of a review — not as standalone requests.

### Review with Inline Comments

```json
{
  "body": "Review summary (optional, can be empty string)",
  "event": "COMMENT",
  "comments": [
    {
      "path": "src/main.go",
      "new_position": 42,
      "body": "This variable should be declared as `const`."
    }
  ]
}
```

### Field Descriptions

| Field | Required | Description |
|---|---|---|
| `body` | Yes | Review-level summary (can be empty string `""`) |
| `event` | Yes | Review event: `COMMENT`, `APPROVED`, or `REQUEST_CHANGES` |
| `comments` | No | Array of inline comment objects (omit for review-only submissions) |
| `comments[].body` | Yes | The inline comment text (Markdown supported) |
| `comments[].path` | Yes | The relative path of the file to comment on |
| `comments[].new_position` | Yes* | Line number in the **new** file (post-change). Use for added or context lines |
| `comments[].old_position` | Yes* | Line number in the **old** file (pre-change). Use for deleted lines |

> \* Provide `new_position` for comments on new/added lines and `old_position` for comments on deleted lines. At least one must be specified.

### Position Targeting Rules

| Comment Target | Field | Notes |
|---|---|---|
| Added line (new code) | `new_position` | Line exists only in the new file |
| Removed line (old code) | `old_position` | Line exists only in the old file |
| Unchanged (context) line | `new_position` | Line exists in both; use `new_position` |

> **Key difference from GitHub:** Gitea uses `new_position` / `old_position` instead of GitHub's `line` + `side` model. There is no `side` field — the choice of `new_position` vs `old_position` implicitly selects the side.

### Complete Example — Single Inline Comment

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "",
    "event": "COMMENT",
    "comments": [
      {
        "path": "src/handler.js",
        "new_position": 42,
        "body": "This variable should be declared as `const` since it is never reassigned."
      }
    ]
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews"
```

### Complete Example — Multiple Inline Comments

```bash
curl -s -X POST \
  -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "A few suggestions on this PR.",
    "event": "COMMENT",
    "comments": [
      {
        "path": "src/handler.js",
        "new_position": 42,
        "body": "Use `const` here."
      },
      {
        "path": "src/utils.go",
        "new_position": 15,
        "body": "Consider adding error handling."
      },
      {
        "path": "src/old_file.go",
        "old_position": 10,
        "body": "This deleted code should be preserved."
      }
    ]
  }' \
  "<INSTANCE_URL>/api/v1/repos/<OWNER>/{repo_name}/pulls/{index}/reviews"
```

---

## Field Reference

| Field | Type | Description |
|---|---|---|
| `number` | integer | PR/issue number within the repo (same as GitHub's `number`) |
| `id` | integer | Global unique ID across the Gitea instance |
| `html_url` | string | Full URL to view the PR/issue in a browser |
| `head.label` | string | Head branch name (GitHub: `head.ref`) |
| `base.label` | string | Base branch name (GitHub: `base.ref`) |
| `head.sha` | string | Head commit SHA |
| `state` | string | Current state: `open` or `closed` (PRs/issues); check `merged` field for merged PRs |
| `merged` | boolean | Whether the PR has been merged (only on PR objects) |
| `mergeable` | boolean | Whether the PR can be merged |
| `merge_commit_sha` | string | SHA of the merge commit (after merge) |
| `changed_files` | integer | Number of changed files in the PR |
| `additions` | integer | Total lines added in the PR |
| `deletions` | integer | Total lines deleted in the PR |
| `user` | object | Author object with `login`, `id`, `avatar_url`, `html_url` |
| `labels` | array | Array of label objects (each with `id`, `name`, `color`, `description`) |
| `milestone` | object | Milestone object with `id`, `title`, `due_on` |
| `updated_at` | string | ISO 8601 timestamp of the last update |
| `created_at` | string | ISO 8601 timestamp of creation |
| `body` | string | Body text of the PR or issue (Markdown) |
| `pull_request` | object | Present on issue objects that are PRs; contains `html_url` |
| `filename` | string | On file objects from `GET_CR_DIFF`: path of the changed file |
| `status` | string | On file objects: `added`, `removed`, `modified`, `renamed` |
| `previous_filename` | string | On file objects: original path before rename |
| `draft` | boolean | Whether the PR is a draft |
| `assignees` | array | Array of user objects assigned to the PR/issue |

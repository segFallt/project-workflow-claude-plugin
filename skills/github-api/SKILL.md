---
name: github-api
description: Use when making GitHub REST API calls — provides curl patterns for PRs, issues, comments, reviews, and branch operations
---

# GitHub REST API Reference

This document maps standardized operation names to their GitHub REST API equivalents. Action prompts reference these operations by name (e.g., `CREATE_CR`, `POST_CR_COMMENT`) instead of embedding inline curl examples.

---

## Authentication

Token header: `Authorization: Bearer $<API_TOKEN_ENV_VAR>`

Load from `<ENV_FILE_PATH>`:
```bash
source <ENV_FILE_PATH>
export GITHUB_TOKEN=$<API_TOKEN_ENV_VAR>
```

curl base:
```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/..."
```

For POST/PUT/PATCH requests, add `-H "Content-Type: application/json"` and `-d '{...}'`.

> **Note:** GitHub recommends including both `Accept` and `X-GitHub-Api-Version` headers on every request. The legacy `Authorization: token $<API_TOKEN_ENV_VAR>` format also works but is deprecated. For GitHub Enterprise Server, replace `https://api.github.com` with `<INSTANCE_URL>/api/v3`.

---

## Terminology Mapping

| Generic Term | GitHub Term |
|---|---|
| Change Request (CR) | Pull Request (PR) |
| CR ID | PR number (`number`) |
| CR reference | `#{number}` |
| Comment | Comment |
| Comment thread | Review comment thread |
| CI Pipeline | GitHub Actions workflow run / Check suite |
| Check / Job | Check run / Workflow job |
| Approve CR | Review with `event=APPROVE` |
| Repository | Repository |
| Base branch | Base branch (`base.ref`) |
| Head branch | Head branch (`head.ref`) |
| Issue reference | `#{number}` |
| Group | Organization (`org`) |
| Owner | Owner (user or organization) |

---

## Project/Repo Identification

GitHub identifies repositories by **owner** and **repo name** in the URL path: `{owner}/{repo}`.

- `<OWNER>` is a GitHub user or organization name. No URL-encoding is needed.
- Use `<OWNER>/{repo_name}` in API paths throughout this document.

Example:
```
# Using owner/repo
GET https://api.github.com/repos/<OWNER>/my-service/pulls

# GitHub Enterprise Server
GET <INSTANCE_URL>/api/v3/repos/<OWNER>/my-service/pulls
```

> **Key difference from GitLab:** GitHub does not use numeric project IDs in API paths. All routes use the `{owner}/{repo}` format.

---

## API Operations

### 1. LIST_OPEN_CRS

List all open pull requests for a repository.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/pulls?state=open&per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls?state=open&per_page=100"
```

> **Note:** GitHub does not have a single endpoint to list PRs across an entire organization. To list PRs across multiple repos, either query each repo individually or use the search API: `GET /search/issues?q=org:<OWNER>+type:pr+state:open`.

**Key response fields:** `number`, `title`, `user`, `head.ref`, `base.ref`, `draft`, `updated_at`, `html_url`, `mergeable`, `changed_files`.

---

### 2. GET_CR

Get pull request details.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}"
```

**Key response fields:** `number`, `title`, `body`, `state` (`open`, `closed`), `head.ref`, `base.ref`, `head.sha`, `mergeable`, `mergeable_state`, `draft`, `updated_at`, `html_url`, `merged`, `merge_commit_sha`, `changed_files`, `additions`, `deletions`.

---

### 3. GET_CR_DIFF

Get PR changed files with patch data.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/files?per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/files?per_page=100"
```

**Key response fields:** Array of file objects with `filename`, `status` (`added`, `removed`, `modified`, `renamed`), `additions`, `deletions`, `changes`, `patch` (unified diff string), `previous_filename` (for renames).

---

### 4. CREATE_CR

Create a new pull request.

```
POST https://api.github.com/repos/<OWNER>/{repo_name}/pulls
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "head": "{feature_branch}",
    "base": "main",
    "title": "{PR title}",
    "body": "{PR description}"
  }' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls"
```

**Key response fields:** `number`, `html_url`, `state`, `head.ref`, `base.ref`.

---

### 5. APPROVE_CR

Approve a pull request by submitting a review with `APPROVE` event.

```
POST https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/reviews
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "APPROVE"
  }' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/reviews"
```

**Key response fields:** `id` (review ID), `state` (`APPROVED`), `user`, `html_url`.

---

### 6. UNAPPROVE_CR

Dismiss a previous approval review. This is a two-step process: first find the review ID, then dismiss it.

**Step 1 — List reviews to find the approval review ID:**
```
GET https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/reviews
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/reviews"
```

Look for the review with `state: "APPROVED"` and note its `id`.

**Step 2 — Dismiss the review:**
```
PUT https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/reviews/{review_id}/dismissals
```

```bash
curl -s -X PUT \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Dismissing approval — changes requested."
  }' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/reviews/{review_id}/dismissals"
```

**Key response fields:** `id`, `state` (`DISMISSED`), `user`.

> **Note:** Unlike GitLab's simple unapprove endpoint, GitHub requires you to dismiss a specific review by its ID. You must also have appropriate permissions (maintainer or admin) to dismiss reviews.

---

### 7. MERGE_CR

Merge a pull request.

```
PUT https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/merge
```

```bash
curl -s -X PUT \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "merge_method": "squash"
  }' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/merge"
```

**Key response fields:** `merged` (boolean), `message`, `sha` (merge commit SHA).

> **Note:** `merge_method` can be `merge` (default), `squash`, or `rebase`. The available methods depend on repository settings.

---

### 8. POST_CR_COMMENT

Post a general comment on a pull request. In GitHub, PRs are also issues, so general comments use the issues endpoint.

```
POST https://api.github.com/repos/<OWNER>/{repo_name}/issues/{pull_number}/comments
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{"body": "{comment text}"}' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/issues/{pull_number}/comments"
```

> **Key quirk:** GitHub treats PRs as a special type of issue. General (non-inline) PR comments are posted via the **issues** comments endpoint using the PR number as `{issue_number}`. Inline code comments use the separate pulls review comments endpoint (see `POST_CR_INLINE_COMMENT`).

**Key response fields:** `id`, `body`, `user`, `created_at`, `html_url`.

---

### 9. POST_CR_INLINE_COMMENT

Post an inline review comment on a specific line in the diff.

```
POST https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "{comment text}",
    "commit_id": "{head_sha}",
    "path": "path/to/file.go",
    "line": 42,
    "side": "RIGHT"
  }' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments"
```

See the **Inline Comment Position Object** section below for full details on positioning fields.

**Key response fields:** `id` (comment ID), `body`, `path`, `line`, `side`, `in_reply_to_id`, `html_url`.

---

### 10. RESOLVE_CR_THREAD

Mark a review comment thread as resolved.

> **Important:** The GitHub REST API does not have a native endpoint for resolving PR review comment threads. Thread resolution is only available through the GraphQL API.

**GraphQL workaround:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { resolveReviewThread(input: { threadId: \"{thread_node_id}\" }) { thread { isResolved } } }"
  }' \
  "https://api.github.com/graphql"
```

**To obtain the `thread_node_id`**, use the GraphQL API to query PR review threads:
```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { repository(owner: \"<OWNER>\", name: \"{repo_name}\") { pullRequest(number: {pull_number}) { reviewThreads(first: 100) { nodes { id isResolved comments(first: 1) { nodes { body path line } } } } } } }"
  }' \
  "https://api.github.com/graphql"
```

> **Alternative approach:** If GraphQL is not available, posting a reply indicating the thread is addressed (via `REPLY_TO_CR_THREAD`) is the common REST-only workaround. The thread will not be visually marked as "resolved" in the GitHub UI, but the reply serves as an acknowledgment.

---

### 11. GET_CR_COMMENTS

Get all comments on a pull request. GitHub stores general comments and inline review comments in separate endpoints — query both.

**General comments (issue comments):**
```
GET https://api.github.com/repos/<OWNER>/{repo_name}/issues/{pull_number}/comments?per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/issues/{pull_number}/comments?per_page=100"
```

**Inline review comments:**
```
GET https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments?per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments?per_page=100"
```

**Key response fields (general):** Array of comment objects with `id`, `body`, `user`, `created_at`, `updated_at`, `html_url`.

**Key response fields (review):** Array of review comment objects with `id`, `body`, `user`, `path`, `line`, `side`, `in_reply_to_id`, `created_at`, `updated_at`, `html_url`.

---

### 12. GET_CR_LINKED_ISSUES

Get issues that will be closed when the PR is merged.

> **Important:** GitHub does not have a dedicated REST API endpoint for listing linked/closing issues. Issue links are established through keywords in the PR body or commit messages.

**Approach:** Parse the PR `body` field (from `GET_CR`) for closing keyword patterns:
- `Closes #N`
- `Fixes #N`
- `Resolves #N`

These keywords are case-insensitive and can also reference cross-repo issues: `Closes owner/repo#N`.

```bash
# 1. Get the PR body
PR_BODY=$(curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}" | jq -r '.body')

# 2. Extract issue numbers from closing keywords
echo "$PR_BODY" | grep -oiE '(closes|fixes|resolves)\s+#[0-9]+' | grep -oE '#[0-9]+'
```

> **GraphQL alternative:** The GraphQL API exposes `closingIssuesReferences` on the `PullRequest` type if a more reliable approach is needed.

---

### 13. GET_CR_PIPELINES

Get CI check status for a pull request's head commit.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/commits/{ref}/check-runs?per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/commits/{head_sha}/check-runs?per_page=100"
```

Obtain `{head_sha}` from `GET_CR` response field `head.sha`.

**Key response fields:** `total_count`, `check_runs[]` each with `id`, `name`, `status` (`queued`, `in_progress`, `completed`), `conclusion` (`success`, `failure`, `neutral`, `cancelled`, `timed_out`, `action_required`), `html_url`, `started_at`, `completed_at`.

> **Alternative:** Use check-suites for a grouped view: `GET /repos/<OWNER>/{repo_name}/commits/{ref}/check-suites`.

---

### 14. GET_PIPELINE_JOBS

List jobs in a GitHub Actions workflow run.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/actions/runs/{run_id}/jobs
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/actions/runs/{run_id}/jobs"
```

> **Mapping from check runs to workflow runs:** A check run's `details_url` links to the workflow run, or you can list workflow runs via `GET /repos/<OWNER>/{repo_name}/actions/runs?head_sha={head_sha}` and use the `id` from the response.

**Key response fields:** `total_count`, `jobs[]` each with `id`, `name`, `status` (`queued`, `in_progress`, `completed`), `conclusion`, `started_at`, `completed_at`, `html_url`, `steps[]` (array of step objects with `name`, `status`, `conclusion`).

---

### 15. GET_JOB_LOG

Get raw log output for a workflow job.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/actions/jobs/{job_id}/logs
```

```bash
curl -s -L -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/actions/jobs/{job_id}/logs"
```

> **Note:** This endpoint returns a `302` redirect to a temporary download URL. Use `-L` (follow redirects) with curl to get the actual log content.

**Response:** Raw plain text of the job log. Read the tail for error messages in failed jobs.

---

### 16. GET_ISSUE

Get issue details.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/issues/{issue_number}
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/issues/{issue_number}"
```

**Key response fields:** `number`, `title`, `body`, `labels`, `milestone`, `state`, `assignees`, `html_url`.

> **Note:** GitHub's issues endpoint also returns pull requests (since PRs are issues). You can distinguish them by the presence of the `pull_request` field in the response.

---

### 17. CREATE_ISSUE

Create a new issue.

```
POST https://api.github.com/repos/<OWNER>/{repo_name}/issues
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "{issue title}",
    "body": "{issue description}",
    "labels": ["{label1}", "{label2}"],
    "milestone": {milestone_number}
  }' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/issues"
```

> **Note:** Unlike GitLab, GitHub's `labels` field takes an array of strings, not a comma-separated string. The `milestone` field takes the milestone `number`, not `id`.

**Key response fields:** `number`, `html_url`, `title`, `labels`, `milestone`.

---

### 18. CLOSE_ISSUE

Close an issue.

```
PATCH https://api.github.com/repos/<OWNER>/{repo_name}/issues/{issue_number}
```

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{"state": "closed"}' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/issues/{issue_number}"
```

**Key response fields:** `number`, `state` (should become `closed`), `html_url`.

---

### 19. LIST_LABELS

List available labels for a repository.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/labels?per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/labels?per_page=100"
```

**Key response fields:** Array of label objects with `name`, `color`, `description`.

---

### 20. LIST_GROUP_LABELS

List organization-level labels. GitHub does not have native org-level labels in the REST API, but you can list labels for an organization's repositories.

> **Important:** GitHub does not natively support organization-wide labels. Labels are per-repository. The closest equivalent is to query a "template" repository's labels, or use the organization's `.github` repository if it exists.

**Workaround — list labels from the org's `.github` repo:**
```
GET https://api.github.com/repos/<OWNER>/.github/labels?per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/.github/labels?per_page=100"
```

> **Alternative:** Use `GET /orgs/<OWNER>/properties` or manage shared labels through GitHub's "default repository labels" organization setting (configured in the UI, not via REST API).

**Key response fields:** Array of label objects with `name`, `color`, `description`.

---

### 21. LIST_MILESTONES

List active milestones for a repository.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/milestones?state=open&per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/milestones?state=open&per_page=100"
```

**Key response fields:** Array of milestone objects with `number`, `title`, `due_on`, `state`, `html_url`, `open_issues`, `closed_issues`.

> **Note:** GitHub uses `number` (not `id`) when referencing milestones in other API calls (e.g., assigning a milestone to an issue).

---

### 22. SEARCH_BRANCHES

Search for branches matching a pattern.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/branches?per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/branches?per_page=100"
```

> **Note:** The branches endpoint does not support a `search` query parameter. For prefix-based filtering, use the Git matching refs endpoint instead:
> ```
> GET https://api.github.com/repos/<OWNER>/{repo_name}/git/matching-refs/heads/{prefix}
> ```
> Otherwise, filter the branches list client-side.

**Key response fields:** Array of branch objects with `name`, `commit.sha`, `commit.url`, `protected`.

---

### 23. POST_ISSUE_COMMENT

Post a comment on an issue. Uses the same endpoint as `POST_CR_COMMENT` since PRs are issues in GitHub.

```
POST https://api.github.com/repos/<OWNER>/{repo_name}/issues/{issue_number}/comments
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{"body": "{comment text}"}' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/issues/{issue_number}/comments"
```

**Key response fields:** `id`, `body`, `user`, `created_at`, `html_url`.

---

### 24. REPLY_TO_CR_THREAD

Reply to an existing review comment thread on a pull request.

```
POST https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments/{comment_id}/replies
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{"body": "{reply text}"}' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments/{comment_id}/replies"
```

> **Note:** `{comment_id}` is the `id` of the top-level review comment in the thread. You can get this from the `GET_CR_DISCUSSIONS` response — use the comment that has no `in_reply_to_id` (it is the thread root).

**Key response fields:** `id`, `body`, `user`, `created_at`, `html_url`, `in_reply_to_id`.

---

### 25. GET_CR_DISCUSSIONS

Get all review comment threads on a pull request.

```
GET https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments?per_page=100
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments?per_page=100"
```

**Key response fields:** Array of review comment objects. Each has `id`, `body`, `user`, `path`, `line`, `side`, `in_reply_to_id`, `created_at`, `updated_at`, `html_url`.

> **Threading model:** GitHub uses `in_reply_to_id` to represent threads. Comments where `in_reply_to_id` is absent or `null` are thread roots. Comments with `in_reply_to_id` set are replies to that root comment. To reconstruct threads, group comments by their root `id` — all replies point back to the same root comment's `id` via their `in_reply_to_id` field.

---

### 26. SEARCH_ISSUES

Search for issues by keyword.

```
GET https://api.github.com/search/issues?q={query}+repo:<OWNER>/{repo_name}+type:issue+state:open
```

```bash
curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/search/issues?q={query}+repo:<OWNER>/{repo_name}+type:issue+state:open"
```

Search with 2-3 keywords from the issue title. Use `type:issue` to exclude pull requests from results. Use `type:pr` to search only pull requests.

> **Note:** The search API has a rate limit of 30 requests per minute for authenticated users. URL-encode the query string if it contains special characters.

**Key response fields:** `total_count`, `items[]` each with `number`, `title`, `body`, `labels`, `state`, `html_url`.

---

## Inline Comment Position Object

The position fields are required when posting inline comments via `POST_CR_INLINE_COMMENT`. They tell GitHub exactly which line of which file to attach the comment to.

### Obtaining `head.sha`

First, call `GET_CR` to retrieve the pull request details. The response includes the head commit SHA:

```json
{
  "head": {
    "sha": "abc123def456abc123def456abc123def456abcd",
    "ref": "feature-branch"
  }
}
```

Use `head.sha` as the `commit_id` in the inline comment request.

### Position Fields

```json
{
  "body": "comment text",
  "commit_id": "<from head.sha>",
  "path": "path/to/file.go",
  "line": 42,
  "side": "RIGHT",
  "start_line": 40,
  "start_side": "RIGHT"
}
```

### Field Descriptions

| Field | Required | Description |
|---|---|---|
| `body` | Yes | The comment text (Markdown supported) |
| `commit_id` | Yes | The SHA of the head commit (from `head.sha`) |
| `path` | Yes | The relative path of the file to comment on |
| `line` | Yes | The line number in the diff to comment on (end line for multi-line) |
| `side` | Yes | Which side of the diff: `LEFT` (base/old file) or `RIGHT` (head/new file) |
| `start_line` | No | For multi-line comments: the first line of the range |
| `start_side` | No | For multi-line comments: the side for the start line (`LEFT` or `RIGHT`) |

### Side Targeting Rules

| Comment Target | `side` Value | Notes |
|---|---|---|
| Added line (new code) | `RIGHT` | Line exists only in the head version |
| Removed line (old code) | `LEFT` | Line exists only in the base version |
| Unchanged (context) line | `RIGHT` | Line exists in both; use `RIGHT` by convention |

### Complete Example

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "This variable should be declared as `const` since it is never reassigned.",
    "commit_id": "abc123def456abc123def456abc123def456abcd",
    "path": "src/handler.js",
    "line": 42,
    "side": "RIGHT"
  }' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments"
```

### Multi-Line Comment Example

```bash
curl -s -X POST \
  -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "body": "This entire block could be simplified using a helper function.",
    "commit_id": "abc123def456abc123def456abc123def456abcd",
    "path": "src/handler.js",
    "start_line": 40,
    "start_side": "RIGHT",
    "line": 48,
    "side": "RIGHT"
  }' \
  "https://api.github.com/repos/<OWNER>/{repo_name}/pulls/{pull_number}/comments"
```

---

## Field Reference

| Field | Type | Description |
|---|---|---|
| `number` | integer | PR/issue number within the repo (equivalent to GitLab's `iid`) |
| `id` | integer | Global unique ID across GitHub (rarely needed in API paths) |
| `html_url` | string | Full URL to view the PR/issue in a browser (GitLab uses `web_url`) |
| `head.ref` | string | Head branch name (GitLab: `source_branch`) |
| `base.ref` | string | Base branch name (GitLab: `target_branch`) |
| `head.sha` | string | Head commit SHA; use as `commit_id` for inline comments (GitLab: `diff_refs.head_sha`) |
| `draft` | boolean | Whether the PR is a draft |
| `state` | string | Current state: `open` or `closed` (PRs/issues); check `merged` field for merged PRs |
| `merged` | boolean | Whether the PR has been merged (only on PR objects) |
| `mergeable` | boolean | Whether the PR can be merged (may be `null` while computing) |
| `mergeable_state` | string | Merge readiness: `clean`, `dirty`, `blocked`, `unstable`, `unknown` |
| `changed_files` | integer | Number of changed files in the PR |
| `additions` | integer | Total lines added in the PR |
| `deletions` | integer | Total lines deleted in the PR |
| `user` | object | Author object with `login`, `id`, `avatar_url`, `html_url` |
| `labels` | array | Array of label objects (each with `name`, `color`, `description`) |
| `milestone` | object | Milestone object with `number`, `title`, `due_on` |
| `updated_at` | string | ISO 8601 timestamp of the last update |
| `created_at` | string | ISO 8601 timestamp of creation |
| `body` | string | Body text of the PR or issue (Markdown) |
| `in_reply_to_id` | integer | On review comments: parent comment ID for threaded replies |
| `pull_request` | object | Present on issue objects that are PRs; contains `url`, `html_url` |
| `patch` | string | On file objects from `GET_CR_DIFF`: unified diff for that file |
| `filename` | string | On file objects from `GET_CR_DIFF`: path of the changed file |
| `status` | string | On file objects: `added`, `removed`, `modified`, `renamed` |
| `previous_filename` | string | On file objects: original path before rename |

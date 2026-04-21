## State Tracking

This directive documents the shared state persistence pattern used by the `development` and `code-review` skills to survive context compaction mid-loop.

---

### Base Directory

State files live in the **primary repo's main checkout**, never inside a worktree:

```
<PRIMARY_REPO_LOCAL_PATH>/.state-tracking/
```

> **Important:** The worktree is cleaned up in Phase 7; the state file must outlive it until explicitly deleted.

---

### File Layout

```
.state-tracking/
  development/
    {branch-slug}.json     — one file per in-flight branch
  code-review/
    tracking.json          — single file for the code-review tracking list
```

State files are gitignored (see `init` skill — Step 9 adds `.state-tracking/` to `.gitignore` and creates the directory).

---

### Branch Slug Derivation

Replace every `/` with `-` in the branch name:

```
feature/42-add-portfolio-export  →  feature-42-add-portfolio-export
fix/17-redis-ack-on-error        →  fix-17-redis-ack-on-error
```

---

### State File Schema

#### Development — `.state-tracking/development/{branch-slug}.json`

```json
{
  "schema_version": 1,
  "skill": "development",
  "created_at": "2026-04-18T10:00:00Z",
  "updated_at": "2026-04-18T12:34:56Z",
  "issue": {
    "id": 42,
    "reference": "project-workflow-claude-plugin#42",
    "url": "https://gitlab.example.com/group/repo/-/issues/42",
    "title": "Add portfolio export endpoint"
  },
  "branch": "feature/42-add-portfolio-export",
  "primary_repo": {
    "name": "project-workflow-claude-plugin",
    "local_path": "/workspace/plugin/project-workflow-claude-plugin"
  },
  "worktrees": {
    "project-workflow-claude-plugin": "/workspace/worktrees/feature-42/.../project-workflow-claude-plugin"
  },
  "cr": {
    "reference": "!123",
    "iid": 123,
    "url": "https://gitlab.example.com/group/repo/-/merge_requests/123",
    "project_id": "group/repo"
  },
  "phase": 6,
  "loop": {
    "review_round": 2,
    "max_review_rounds": 5,
    "last_checked_at": "2026-04-18T12:30:00Z",
    "last_poll_at": "2026-04-18T12:34:56Z"
  },
  "design_document_md": "## Design: #42...",
  "skipped_items": [
    {
      "discussion_id": "abc123",
      "file": "src/foo.ts",
      "line": 42,
      "reason": "Reviewer asked for a refactor that exceeds issue scope."
    }
  ],
  "user_confirmations": [
    {"gate": "design_approved", "at": "2026-04-18T10:20:00Z"}
  ]
}
```

**Field notes:**
- `cr` is `null` until the CR is created (Phase 4)
- `worktrees` is a map keyed by repo name — supports multi-repo changes
- `loop.last_poll_at` is updated on every write; doubles as a liveness heartbeat
- `design_document_md` stores the full approved design doc text (set at end of Phase 2)
- `skipped_items` is appended whenever the review-feedback sub-agent skips an item
- `user_confirmations` is an audit log of user-approved gates

#### Code-review — `.state-tracking/code-review/tracking.json`

```json
{
  "schema_version": 1,
  "skill": "code-review",
  "created_at": "2026-04-18T10:00:00Z",
  "updated_at": "2026-04-18T12:34:56Z",
  "tracked_crs": [
    {
      "project_id": "group/repo",
      "cr_id": 123,
      "cr_reference": "!123",
      "web_url": "https://gitlab.example.com/group/repo/-/merge_requests/123",
      "last_review_at": "2026-04-18T12:10:00Z",
      "review_round": 1,
      "skipped_items": []
    }
  ]
}
```

---

### Atomic Write Pattern

Always write state files via atomic replace using `mktemp` + `mv -f`:

```bash
STATE_DIR="<PRIMARY_REPO_LOCAL_PATH>/.state-tracking/development"
STATE_FILE="$STATE_DIR/{branch-slug}.json"
mkdir -p "$STATE_DIR"
JSON_PAYLOAD='{ ... }'
TMP="$(mktemp "${STATE_FILE}.tmp.XXXXXX")"
printf '%s' "$JSON_PAYLOAD" > "$TMP"
mv -f "$TMP" "$STATE_FILE"
```

For `code-review`, the equivalent paths are:
```bash
STATE_DIR="<PRIMARY_REPO_LOCAL_PATH>/.state-tracking/code-review"
STATE_FILE="$STATE_DIR/tracking.json"
# Apply the same mkdir -p / mktemp + mv -f pattern above with these paths
```

Update `updated_at` (and `loop.last_poll_at` when in a loop) on every write.

---

### Python 3 Read Pattern

Always read state files via Python 3:

```bash
STATE=$(python3 -c "
import json, sys
try:
    with open('$STATE_FILE') as f:
        data = json.load(f)
    print(json.dumps(data))
except (FileNotFoundError, json.JSONDecodeError) as e:
    print('ERROR:' + str(e), file=sys.stderr)
    sys.exit(1)
")
```

Extract individual fields:

```bash
PHASE=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['phase'])")
REVIEW_ROUND=$(echo "$STATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['loop']['review_round'])")
CR_IID=$(echo "$STATE" | python3 -c "import sys,json; cr=json.load(sys.stdin).get('cr'); print(cr['iid'] if cr else '')")
```

---

### Stale File Detection

A state file is **stale** if either condition is true:
1. `updated_at` is more than 24 hours ago, OR
2. `cr.iid` is present AND `GET_CR` returns `state` of `merged` or `closed`

If `cr.iid` is absent (phase < 5), rely on `updated_at` alone.

---

### Corrupt File Handling

If the state file cannot be parsed (malformed JSON):
1. Warn with exactly one line: `State file for issue #N was unreadable — starting fresh.`
2. Delete the corrupt file
3. Proceed as if no state file exists

---

### Concurrency Note

Concurrent `code-review` sessions against the same `tracking.json` are explicitly out of scope. The single-file design is safe for single-process usage only.

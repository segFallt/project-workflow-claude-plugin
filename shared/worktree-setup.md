## Worktree Setup

This directive standardizes worktree creation, agent identity, authenticated push, and cleanup across all skills and sub-agents.

### Prerequisites

Before creating a worktree, ensure:
- You have read `.claude/project-config/PROJECT.md` to obtain `<WORKTREES_BASE>`, the repo's local path, and the host configuration
- You have loaded credentials from `<ENV_FILE_PATH>` via `source <ENV_FILE_PATH>`

### Step 1: Fetch & Create Worktree

Always fetch the latest trunk before creating a worktree:

```bash
cd <REPO_LOCAL_PATH>
git fetch origin
git worktree add \
  <WORKTREES_BASE>/.worktrees/{branch_name}/{repo_name} \
  -b {branch_name} origin/main
```

All feature branches must be based on `origin/main`. Never branch from a stale local `main` or from another feature branch.

### Step 2: Resolve Agent Identity

Resolve the agent's git identity from the repository host API. This identity is used on commit commands via `-c` flags — it is NOT persisted to any git config file.

**GitLab:**
```bash
AGENT_USER=$(curl -s -H "PRIVATE-TOKEN: $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/api/v4/user")
GIT_USER_NAME=$(echo "$AGENT_USER" | python3 -c \
  "import sys,json; u=json.load(sys.stdin); print(u['name'])")
GIT_USER_EMAIL=$(echo "$AGENT_USER" | python3 -c \
  "import sys,json; u=json.load(sys.stdin); \
print(u.get('commit_email') or u.get('email') or u['username']+'@users.noreply.<GITLAB_HOST>')")
```

**GitHub:**
```bash
AGENT_USER=$(curl -s -H "Authorization: Bearer $<API_TOKEN_ENV_VAR>" \
  "<API_BASE_URL>/user")
GIT_USER_NAME=$(echo "$AGENT_USER" | python3 -c \
  "import sys,json; u=json.load(sys.stdin); print(u['name'] or u['login'])")
GIT_USER_EMAIL=$(echo "$AGENT_USER" | python3 -c \
  "import sys,json; u=json.load(sys.stdin); \
print(u.get('email') or str(u['id'])+'+'+u['login']+'@users.noreply.<GITHUB_HOST>')")
```

**Gitea:**
```bash
AGENT_USER=$(curl -s -H "Authorization: token $<API_TOKEN_ENV_VAR>" \
  "<GITEA_HOST>/api/v1/user")
GIT_USER_NAME=$(echo "$AGENT_USER" | python3 -c \
  "import sys,json; u=json.load(sys.stdin); print(u['full_name'] or u['login'])")
GIT_USER_EMAIL=$(echo "$AGENT_USER" | python3 -c \
  "import sys,json; u=json.load(sys.stdin); \
print(u.get('email') or u['login']+'@noreply.<GITEA_HOST>')")
```

Store `GIT_USER_NAME` and `GIT_USER_EMAIL` in shell variables for the session.

### Step 3: Build Authenticated Push URL

Build a token-authenticated URL for push operations. This URL is stored in a shell variable — it is NOT written to any git config or remote definition.

**GitLab:**
```bash
PUSH_URL="https://oauth2:$<API_TOKEN_ENV_VAR>@<GITLAB_HOST>/<GROUP>/<REPO>.git"
```

**GitHub:**
```bash
PUSH_URL="https://oauth2:$<API_TOKEN_ENV_VAR>@<GITHUB_HOST>/<GROUP>/<REPO>.git"
```

**Gitea:**
```bash
PUSH_URL="https://oauth2:$<API_TOKEN_ENV_VAR>@<GITEA_HOST>/<GROUP>/<REPO>.git"
```

### Using Identity & Push URL

**Committing** — pass identity via `-c` flags (no persistent config):
```bash
git -C <WORKTREE_PATH> \
  -c user.name="$GIT_USER_NAME" \
  -c user.email="$GIT_USER_EMAIL" \
  commit -m "{message}"
```

**Pushing** — use the push URL variable directly (no `remote set-url`):
```bash
git -C <WORKTREE_PATH> push "$PUSH_URL" {branch_name}
```

To set upstream tracking on first push:
```bash
git -C <WORKTREE_PATH> push -u "$PUSH_URL" {branch_name}
```

> **WARNING: DO NOT modify git config or remote URLs.** Never run `git config user.name`, `git config user.email`, or `git remote set-url` in any scope (global, local, or worktree). These commands persist changes that pollute the project owner's environment. Always use `-c` flags for identity and `$PUSH_URL` for authentication.

### Cleanup

When the task is complete (CR merged, closed, or user stops):

```bash
git -C <REPO_LOCAL_PATH> worktree remove \
  <WORKTREES_BASE>/.worktrees/{branch_name}/{repo_name}
git -C <REPO_LOCAL_PATH> worktree prune
```

### Sub-Agent Handoff

When delegating to sub-agents, pass these values:
- `<WORKTREE_PATH>` — the sub-agent's working directory
- `GIT_USER_NAME` and `GIT_USER_EMAIL` — for commits
- `PUSH_URL` — only if the sub-agent needs to push (most do not)

Sub-agents should NOT create worktrees, modify git config, or run `git fetch`. The orchestrator handles all of this.

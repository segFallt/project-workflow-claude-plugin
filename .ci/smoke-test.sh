#!/bin/sh
# smoke-test.sh — Verify structural integrity of skills and shared sub-agents.
#
# Checks:
#   1. Each skills/<name>/SKILL.md exists and is non-empty.
#   2. Each skills/<name>/sub-agents/*.md is non-empty.
#   3. Each shared/sub-agents/*.md is non-empty.
#   4. Cross-references in SKILL.md files (./sub-agents/<file>.md) resolve.
#
# Exits 1 if any check fails, 0 if all pass.

set -eu

# ── Resolve repo root (parent of this script's directory) ────────────────────

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

FAILED=0

# FAILED is used as an accumulator rather than failing immediately on the first
# error. This lets the script report all problems at once so the user can fix
# them in a single pass instead of discovering failures one at a time.
#
# NOTE for contributors: because errors are accumulated rather than propagated,
# commands inside $(...) subshells or after || operators are NOT covered by
# set -eu. If a check can fail silently, call fail() explicitly instead of
# relying on errexit to catch it.

pass() {
  printf '[PASS] %s\n' "$1"
}

fail() {
  printf '[FAIL] %s\n' "$1"
  FAILED=1
}

# ── 1. Each skills/<name>/SKILL.md exists and is non-empty ───────────────────

for skill_dir in "$REPO_ROOT/skills"/*/; do
  # Skip if glob matched nothing or a non-directory
  [ -d "$skill_dir" ] || continue

  skill_name=$(basename "$skill_dir")
  skill_md="$skill_dir/SKILL.md"

  if [ -f "$skill_md" ] && [ -s "$skill_md" ]; then
    pass "skills/$skill_name/SKILL.md exists and is non-empty"
  elif [ ! -f "$skill_md" ]; then
    fail "skills/$skill_name/SKILL.md does not exist"
  else
    fail "skills/$skill_name/SKILL.md is empty"
  fi
done

# ── 2. Each skills/<name>/sub-agents/*.md is non-empty ───────────────────────

for agent_file in "$REPO_ROOT/skills"/*/sub-agents/*.md; do
  [ -f "$agent_file" ] || continue

  rel=$(echo "$agent_file" | sed "s|$REPO_ROOT/||")

  if [ -s "$agent_file" ]; then
    pass "$rel is non-empty"
  else
    fail "$rel is empty"
  fi
done

# ── 3. Each shared/sub-agents/*.md is non-empty ──────────────────────────────

for agent_file in "$REPO_ROOT/shared/sub-agents"/*.md; do
  [ -f "$agent_file" ] || continue

  rel=$(echo "$agent_file" | sed "s|$REPO_ROOT/||")

  if [ -s "$agent_file" ]; then
    pass "$rel is non-empty"
  else
    fail "$rel is empty"
  fi
done

# ── 4. Cross-references in SKILL.md files resolve ────────────────────────────

for skill_md in "$REPO_ROOT/skills"/*/SKILL.md; do
  [ -f "$skill_md" ] || continue

  skill_dir=$(dirname "$skill_md")
  skill_name=$(basename "$skill_dir")

  # Extract all ./sub-agents/<name>.md references.
  # Note: this check only resolves references local to the skill directory
  # (i.e. ./sub-agents/ paths). References to shared sub-agents
  # (shared/sub-agents/) are covered by check 3 above, not this one.
  refs=$(grep -oE '\./sub-agents/[a-zA-Z0-9_-]+\.md' "$skill_md" || true)

  for ref in $refs; do
    # Strip leading ./
    filename=$(echo "$ref" | sed 's|^\./||')
    target="$skill_dir/$filename"

    if [ -f "$target" ]; then
      pass "skills/$skill_name/$filename referenced in SKILL.md exists"
    else
      fail "skills/$skill_name/$filename referenced in SKILL.md does not exist"
    fi
  done
done

# ── Summary ───────────────────────────────────────────────────────────────────

if [ "$FAILED" -eq 0 ]; then
  printf '\nAll checks passed.\n'
  exit 0
else
  printf '\nOne or more checks failed.\n'
  exit 1
fi

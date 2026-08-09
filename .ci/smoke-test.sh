#!/bin/sh
# smoke-test.sh — Verify structural integrity of skills and shared sub-agents.
#
# Checks:
#   1. Each skills/<name>/SKILL.md exists and is non-empty.
#   2. Each skills/<name>/sub-agents/*.md is non-empty.
#   3. Each shared/sub-agents/*.md is non-empty.
#   4. On-demand pointers in SKILL.md files (./sub-agents/, ./templates/,
#      ./references/, ../../shared/) resolve to existing, non-empty files.
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

# ── 4. On-demand pointers in SKILL.md files resolve ──────────────────────────
#
# Progressive-disclosure skills defer detail to Layer-3 files loaded on demand.
# Resolve the pointer forms the skills use so a dangling relocation link fails
# CI:
#   ./sub-agents/<...>.md   ./templates/<...>.md   ./references/<...>.md
#     — resolved relative to the skill's own directory
#   ../../shared/<...>.md   — cross-skill modules at the repo root (this also
#     non-empty-checks shared/sub-agents/ pointers, in addition to check 3)
# Each target must exist and be non-empty. Cross-skill ../<skill>/SKILL.md
# redirects are intentionally out of scope (not Layer-3 relocation pointers).

for skill_md in "$REPO_ROOT/skills"/*/SKILL.md; do
  [ -f "$skill_md" ] || continue

  skill_dir=$(dirname "$skill_md")
  skill_name=$(basename "$skill_dir")

  # Match the four relocation-pointer forms; dedupe so a file referenced
  # several times is only reported once. Paths use no spaces, so word-splitting
  # the result in the loop below is safe.
  refs=$(grep -oE '(\.\./\.\./shared/[A-Za-z0-9_/.-]+\.md|\./(sub-agents|templates|references)/[A-Za-z0-9_/.-]+\.md)' "$skill_md" | sort -u || true)

  for ref in $refs; do
    # Resolve relative to the SKILL.md's directory; the filesystem collapses
    # the ../.. segments during the -f/-s lookup.
    target="$skill_dir/$ref"

    if [ -f "$target" ] && [ -s "$target" ]; then
      pass "skills/$skill_name/SKILL.md -> $ref resolves"
    elif [ ! -f "$target" ]; then
      fail "skills/$skill_name/SKILL.md -> $ref does not exist"
    else
      fail "skills/$skill_name/SKILL.md -> $ref is empty"
    fi
  done
done

# ── 5. STANDARDS.md template carries its required headings/columns ───────────
#
# .ci/smoke-test.sh's directory globs (checks 1-4) do not reach
# skills/init/templates/*, so a renamed or malformed STANDARDS.md template would
# otherwise slip through CI. This check guards the template init reads as its
# single source: the `## Universal Principles` heading and the normalized
# `Category | What to check | Severity` column header must both be present.

standards_tmpl="$REPO_ROOT/skills/init/templates/STANDARDS.md"

if [ ! -f "$standards_tmpl" ]; then
  fail "skills/init/templates/STANDARDS.md does not exist"
elif ! grep -q '^## Universal Principles' "$standards_tmpl"; then
  fail "skills/init/templates/STANDARDS.md missing '## Universal Principles' heading"
elif ! grep -q '^| Category | What to check | Severity |' "$standards_tmpl"; then
  fail "skills/init/templates/STANDARDS.md missing 'Category | What to check | Severity' column header"
else
  pass "skills/init/templates/STANDARDS.md has required headings and columns"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

if [ "$FAILED" -eq 0 ]; then
  printf '\nAll checks passed.\n'
  exit 0
else
  printf '\nOne or more checks failed.\n'
  exit 1
fi

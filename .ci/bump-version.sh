#!/bin/sh
# bump-version.sh — Bump plugin version, update CHANGELOG, commit, and tag.
#
# Usage — Phase 1 (prepare):
#   .ci/bump-version.sh patch          # 1.0.0 → 1.0.1
#   .ci/bump-version.sh minor          # 1.0.0 → 1.1.0
#   .ci/bump-version.sh major          # 1.0.0 → 2.0.0
#   .ci/bump-version.sh 2.5.0          # explicit version
#
#   Bumps plugin.json and prepends a CHANGELOG template section. Prints
#   instructions and exits. Does NOT commit or tag.
#
# Usage — Phase 2 (commit):
#   .ci/bump-version.sh --commit <x.y.z>
#
#   Verifies plugin.json is already at <x.y.z>, checks that the CHANGELOG
#   entry for [<x.y.z>] has no unfilled placeholder lines (bare "-"), then
#   runs git add and git commit. Prints MR instructions.
#
#   CI creates the version tag automatically when the MR is merged to main.
#
# The script does NOT push — it prints MR instructions at the end.

set -eu

PLUGIN_JSON=".claude-plugin/plugin.json"
CHANGELOG="CHANGELOG.md"

# ── Helpers ───────────────────────────────────────────────────────────────────

# read_plugin_version — sets CURRENT to the version string in plugin.json.
# Prefers node for safe JSON parsing; falls back to grep+sed if node is absent.
read_plugin_version() {
  CURRENT=$(node -p "require('./$PLUGIN_JSON').version" 2>/dev/null) || {
    CURRENT=$(grep '"version"' "$PLUGIN_JSON" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
  }
}

# ── Validate arguments ────────────────────────────────────────────────────────

BUMP_ARG="${1:-}"
if [ -z "$BUMP_ARG" ]; then
  echo "Usage: $0 <major|minor|patch|x.y.z>"
  echo "       $0 --commit <x.y.z>"
  exit 1
fi

# ── Phase 2: --commit <version> ───────────────────────────────────────────────

if [ "$BUMP_ARG" = "--commit" ]; then
  COMMIT_VERSION="${2:-}"
  if [ -z "$COMMIT_VERSION" ]; then
    echo "Usage: $0 --commit <x.y.z>"
    exit 1
  fi

  # Verify plugin.json exists before anything else
  if [ ! -f "$PLUGIN_JSON" ]; then
    echo "ERROR: $PLUGIN_JSON not found. Run this script from the repository root."
    exit 1
  fi

  # Validate version format
  echo "$COMMIT_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
    echo "ERROR: '$COMMIT_VERSION' is not a valid semver string (expected x.y.z)"
    exit 1
  }

  read_plugin_version

  if [ "$CURRENT" != "$COMMIT_VERSION" ]; then
    echo "ERROR: plugin.json version is '$CURRENT', expected '$COMMIT_VERSION'."
    echo "       Run '.ci/bump-version.sh $COMMIT_VERSION' first (Phase 1)."
    exit 1
  fi

  # Extract top CHANGELOG entry for ## [<version>] and count bare placeholder lines
  PLACEHOLDER_COUNT=$(awk \
    '/^## \['"$COMMIT_VERSION"'\]/{found=1; next} /^## \[/ && found{exit} found && /^-$/{count++} END{print count+0}' \
    "$CHANGELOG")

  if [ "$PLACEHOLDER_COUNT" -gt 0 ]; then
    echo "ERROR: CHANGELOG.md contains $PLACEHOLDER_COUNT unfilled placeholder line(s) (bare \"-\") in the [${COMMIT_VERSION}] section."
    echo "       Please fill in the release notes before committing."
    exit 1
  fi

  # Commit (CI owns tag creation on merge to main)
  git add "$PLUGIN_JSON" "$CHANGELOG"
  git commit -m "chore: release v$COMMIT_VERSION"

  echo "Created commit for v$COMMIT_VERSION."
  echo ""
  echo "When ready, open an MR to main:"
  echo ""
  echo "  git push origin HEAD"
  echo ""
  echo "Then open a merge request targeting main. CI will create the v$COMMIT_VERSION"
  echo "tag automatically once the MR is merged."
  exit 0
fi

# ── Phase 1: bump plugin.json and prepend CHANGELOG template ─────────────────

if [ ! -f "$PLUGIN_JSON" ]; then
  echo "ERROR: $PLUGIN_JSON not found. Run this script from the repository root."
  exit 1
fi

read_plugin_version

if [ -z "$CURRENT" ]; then
  echo "ERROR: Could not read version from $PLUGIN_JSON"
  exit 1
fi

MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)
PATCH=$(echo "$CURRENT" | cut -d. -f3)

# ── Compute new version ───────────────────────────────────────────────────────

case "$BUMP_ARG" in
  major)
    NEW_MAJOR=$((MAJOR + 1))
    NEW_VERSION="${NEW_MAJOR}.0.0"
    ;;
  minor)
    NEW_MINOR=$((MINOR + 1))
    NEW_VERSION="${MAJOR}.${NEW_MINOR}.0"
    ;;
  patch)
    NEW_PATCH=$((PATCH + 1))
    NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"
    ;;
  [0-9]*.[0-9]*.[0-9]*)
    echo "$BUMP_ARG" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
      echo "ERROR: '$BUMP_ARG' is not a valid semver string (expected x.y.z)"
      exit 1
    }
    NEW_VERSION="$BUMP_ARG"
    ;;
  *)
    echo "ERROR: Invalid argument '$BUMP_ARG'. Use major, minor, patch, or an explicit x.y.z version."
    exit 1
    ;;
esac

echo "Bumping $CURRENT → $NEW_VERSION"

# ── Update plugin.json ────────────────────────────────────────────────────────

# Use node if available for safe JSON editing; fall back to sed.
if command -v node > /dev/null 2>&1; then
  node -e "
    const fs = require('fs');
    const obj = JSON.parse(fs.readFileSync('$PLUGIN_JSON', 'utf8'));
    obj.version = '$NEW_VERSION';
    fs.writeFileSync('$PLUGIN_JSON', JSON.stringify(obj, null, 2) + '\n');
  "
else
  sed -i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" "$PLUGIN_JSON"
fi

echo "Updated $PLUGIN_JSON"

# ── Prepend CHANGELOG section ─────────────────────────────────────────────────

TODAY=$(date +%Y-%m-%d)
ENTRY="## [$NEW_VERSION] - $TODAY

### Added

-

### Changed

-

### Fixed

-

"

# Prepend after the header block (first blank line after the title)
TMPFILE=$(mktemp)
awk -v entry="$ENTRY" '
  /^## \[/ && !inserted {
    printf "%s", entry
    inserted = 1
  }
  { print }
' "$CHANGELOG" > "$TMPFILE" && mv "$TMPFILE" "$CHANGELOG"

echo "Prepended template section to $CHANGELOG"
echo ""
echo "  → Edit $CHANGELOG to fill in the release notes first, then run:"
echo ""
echo "  .ci/bump-version.sh --commit $NEW_VERSION"
echo ""

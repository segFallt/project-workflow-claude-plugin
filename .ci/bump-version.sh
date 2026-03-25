#!/bin/sh
# bump-version.sh — Bump plugin version, update CHANGELOG, commit, and tag.
#
# Usage:
#   .ci/bump-version.sh patch          # 1.0.0 → 1.0.1
#   .ci/bump-version.sh minor          # 1.0.0 → 1.1.0
#   .ci/bump-version.sh major          # 1.0.0 → 2.0.0
#   .ci/bump-version.sh 2.5.0          # explicit version
#
# The script does NOT push — it prints push instructions at the end.

set -eu

PLUGIN_JSON=".claude-plugin/plugin.json"
CHANGELOG="CHANGELOG.md"

# ── Validate arguments ────────────────────────────────────────────────────────

BUMP_ARG="${1:-}"
if [ -z "$BUMP_ARG" ]; then
  echo "Usage: $0 <major|minor|patch|x.y.z>"
  exit 1
fi

# ── Read current version ──────────────────────────────────────────────────────

if [ ! -f "$PLUGIN_JSON" ]; then
  echo "ERROR: $PLUGIN_JSON not found. Run this script from the repository root."
  exit 1
fi

CURRENT=$(node -p "require('./$PLUGIN_JSON').version" 2>/dev/null) || {
  # Fallback: parse with grep/sed if node is unavailable
  CURRENT=$(grep '"version"' "$PLUGIN_JSON" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
}

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

# ── Guard against duplicate tags ──────────────────────────────────────────────

if git rev-parse "v$NEW_VERSION" > /dev/null 2>&1; then
  echo "ERROR: Tag v$NEW_VERSION already exists locally or has been fetched"
  exit 1
fi

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
echo "  → Edit $CHANGELOG to fill in the release notes before pushing."
echo ""

# ── Commit and tag ────────────────────────────────────────────────────────────

git add "$PLUGIN_JSON" "$CHANGELOG"
git commit -m "chore: release v$NEW_VERSION"
git tag "v$NEW_VERSION"

echo "Created commit and tag v$NEW_VERSION."
echo ""
echo "When ready, push with:"
echo "  git push origin main --tags"

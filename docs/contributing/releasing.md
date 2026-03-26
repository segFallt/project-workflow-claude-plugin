# Releasing project-workflows

This document covers the full release process for maintainers. Releases follow [Semantic Versioning](https://semver.org/) and are tagged `v<major>.<minor>.<patch>`.

## Prerequisites

- Write access to the repository
- `node` (or `bun`) available locally for JSON editing
- `git` configured with your identity
- CI pipelines enabled on the `main` branch (the `auto-tag` job creates the version tag on merge)
- A `RELEASE_TOKEN` CI/CD variable configured in the project's CI/CD settings: a project or group access token with Developer+ role and `write_repository` scope, stored as a **protected** variable named `RELEASE_TOKEN`

---

## Release steps overview

Always start from a release branch — never run the bump steps directly on `main`.

1. **Create a release branch** from an up-to-date `main`:

   ```bash
   git checkout main && git pull
   git checkout -b release/v<x.y.z>
   ```

2. **Run Phase 1** — bump the version and generate a changelog template:

   ```bash
   .ci/bump-version.sh patch   # or minor / major / explicit version
   ```

3. **Edit `CHANGELOG.md`** — replace the placeholder lines with real release notes.

4. **Run Phase 2** — validate the changelog and create the release commit:

   ```bash
   .ci/bump-version.sh --commit <x.y.z>
   ```

5. **Push the branch and open an MR** targeting `main`. Once merged, CI automatically creates the `v<x.y.z>` tag on both GitLab and GitHub and publishes the releases.

See the detailed sections below for full options and troubleshooting.

---

## Phase 1 — Bump version and prepare changelog

Run `bump-version.sh` with the desired bump type or an explicit version:

```bash
.ci/bump-version.sh patch   # 1.0.0 → 1.0.1
.ci/bump-version.sh minor   # 1.0.0 → 1.1.0
.ci/bump-version.sh major   # 1.0.0 → 2.0.0
.ci/bump-version.sh 2.5.0   # explicit version
```

This script:

1. Updates the `version` field in `.claude-plugin/plugin.json`
2. Prepends a changelog template section to `CHANGELOG.md`
3. Prints instructions and exits — it does **not** commit or tag

Edit `CHANGELOG.md` to replace the placeholder lines with real release notes before continuing.

---

## Phase 2 — Validate and commit

Once the changelog is filled in, run Phase 2:

```bash
.ci/bump-version.sh --commit <x.y.z>
```

This script:

1. Verifies `plugin.json` is already at `<x.y.z>` (fails fast if Phase 1 was skipped)
2. Checks that the `CHANGELOG.md` entry for `[<x.y.z>]` contains no unfilled placeholder lines (bare `-`)
3. Stages `plugin.json` and `CHANGELOG.md` and creates the commit `chore: release v<x.y.z>`

The script does **not** push and does **not** create a tag — CI handles the tag.

---

## Opening a merge request (MR-first workflow)

After Phase 2 creates the commit, push the branch and open an MR:

1. Create a release branch (if you do not already have one):

   ```bash
   git checkout -b release/v<x.y.z>
   ```

2. Run Phase 1 and Phase 2 on that branch (see above).

3. Push the branch:

   ```bash
   git push origin HEAD
   ```

4. Open a merge request targeting `main`.

5. Once the MR is reviewed and merged, two `auto-tag` jobs fire in parallel — one in GitLab CI and one in GitHub Actions — each detecting the change to `.claude-plugin/plugin.json` on `main`, reading the new version, and creating the `v<x.y.z>` tag on their respective host. Both include an idempotency guard and skip silently if the tag already exists.

6. The `release` jobs then fire on the new tag on each host: GitLab CI publishes a GitLab Release with the plugin archive; GitHub Actions publishes a GitHub Release via `softprops/action-gh-release`.

---

## Troubleshooting

### Tag already exists

If the `auto-tag` job encounters a tag that already exists (e.g. from a re-run or a manual push), it skips tag creation and exits 0:

```
Tag v1.0.1 already exists — skipping auto-tag
```

No action is needed — the existing tag is left untouched.

### CI version mismatch

The `validate-version` job compares the tag name against `plugin.json`. If they differ:

```
ERROR: Tag version '1.0.1' does not match plugin.json version '1.0.0'
```

This means the tag was created manually with a version that does not match `plugin.json`. Delete the incorrect tag, ensure `plugin.json` is correct, and re-run the pipeline (or allow `auto-tag` to create the tag on the next merge).

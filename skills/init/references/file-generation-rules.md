## File Generation Rules (Reference)

These rules apply to all generated files:

### Required Section Headings

The following headings in `PROJECT.md` are read by other skills and **must appear exactly as written** (including capitalization and spacing):

- `## Overview`
- `## Source Control`
- `## Repository Locations`
- `## Repository Dependency Order`
- `## Container Registry`
- `## Tech Stacks Per Repo`
- `## Cross-Cutting Concerns`
- `## Domain Concepts`
- `## Work Item Conventions`
- `## API Endpoints`
- `## Database Schema`
- `## Concurrent Session Isolation`
- `## Local Development`
- `## Design Documentation`
- `## Git Tags`

`STANDARDS.md` must have `## Universal Principles` and one `## {repo_name}` section per repo.

`PRD-MANIFEST.md` must have `## PRD Directory`, `## Extraction Rules`, `## Test ID Prefixes`, `## Feature Priorities`, `## Deduplication Rules`.

`SPEC-MANIFEST.md` must have `## Spec Sources`, `## Extraction Rules`, `## Test ID Prefixes`, `## Feature Priorities`, `## Deduplication Rules`.

> The documentation profile, docs root, and spec sources are `###` **subsections** under the existing `## Design Documentation` heading — they add no new `##` heading, so the required-headings list above is unchanged.

### Version Stamp Format

Always place `<!-- pw-version: 1.5.0 -->` as the **first line** of every generated config file. This enables update mode detection and template version tracking.

### Not-Configured Marker

For skipped sections — and wherever the skeletons above write `{not-configured stanza}` — use exactly these two lines:
```
<!-- not-configured -->
> This section has not been configured yet. Run `/project-workflows:init` to set it up.
```

This marker is detected by Update Mode to identify unconfigured sections.

### Gitignore Rule

Ensure the project-root `.gitignore` contains `.state-tracking/` so runtime state files are never accidentally committed: if `.gitignore` exists but lacks the line, append it; if it does not exist, create it with this single line. Do NOT remove or modify any other pre-existing lines. This is idempotent and safe to run repeatedly.

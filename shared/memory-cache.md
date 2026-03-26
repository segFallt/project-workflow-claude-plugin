# Config File Memory Cache — Protocol

This file defines the memory-based caching protocol for all `.claude/project-config/` files. Skills and sub-agents use this protocol to avoid redundant config reads across invocations.

---

## Cache Entry Naming

Each config file maps to a named memory entry:

| Config file | Memory entry name |
|---|---|
| `.claude/project-config/PROJECT.md` | `project-config-PROJECT` |
| `.claude/project-config/REVIEW-CRITERIA.md` | `project-config-REVIEW-CRITERIA` |
| `.claude/project-config/TEST-MATRIX.md` | `project-config-TEST-MATRIX` |
| `.claude/project-config/PRD-MANIFEST.md` | `project-config-PRD-MANIFEST` |

---

## Cache Entry Format

Store each entry as a file in the project memory directory with this frontmatter structure:

```markdown
---
name: project-config-{FILE}
description: Cached content of .claude/project-config/{FILE}.md — invalidated by pw-version mismatch
type: project
---

**pw-version:** {version extracted from line 1 of the config file}

{full file content starting from line 2 — everything after the pw-version stamp line}
```

Add a pointer in `MEMORY.md`:
```
- [project-config-{FILE}](project-config-{FILE}.md) — Cached content of .claude/project-config/{FILE}.md
```

---

## Read-Through Protocol

Apply this protocol for every config file you need:

1. **Check `MEMORY.md`** — look for an entry named `project-config-{FILE}`.

2. **Cache miss (entry absent):**
   - Read the full config file from disk.
   - Write a new memory entry using the format above (extract pw-version from line 1; store the rest as body content).
   - Use the content you just read and continue.

3. **Cache present (potential hit):**
   - Read the memory entry file.
   - Extract the `**pw-version:**` value from the entry body. The memory entry stores this as `**pw-version:** X.Y.Z` (markdown bold).
   - Read **only line 1** of the actual config file to get its version stamp. Config files store this as `<!-- pw-version: X.Y.Z -->` (HTML comment). Extract the version string `X.Y.Z` from within the comment.
   - Compare the two version strings (e.g., `1.0.1` vs `1.0.1`).
   - **Versions match → cache hit:** use the content stored in the memory entry. Do not read the full file.
   - **Versions differ → cache stale:** read the full config file from disk, overwrite the memory entry with fresh content, and use the content you just read.

4. **Graceful fallback:** If the memory system is unavailable or the check fails for any reason, read the config file directly from disk (identical to pre-cache behaviour). Do not let a memory failure block the skill.

---

## Write Protocol

When writing a new or updated memory entry:

1. Write the memory file with the entry format above — name, description, type in frontmatter; `**pw-version:**` extracted from the file's line 1 as the first body line; full file content starting from line 2 as the remaining body.
2. Add or update the one-line pointer in `MEMORY.md`: `- [project-config-{FILE}](project-config-{FILE}.md) — Cached content of .claude/project-config/{FILE}.md`.

---

## Cache Invalidation by `init`

The `init` skill writes and rewrites config files. After writing any config file, immediately write or overwrite the corresponding memory entry using the Write Protocol above — do not check the version, always overwrite. This ensures the cache is immediately valid after `init` completes.

---

## Which Files to Cache Per Skill

| Skill / Context | Cache these entries on startup |
|---|---|
| All skills (via `environment-setup.md`) | `project-config-PROJECT` |
| `development` | `project-config-PROJECT` |
| `issue-creation` | `project-config-PROJECT` |
| `code-review` | `project-config-PROJECT`, `project-config-REVIEW-CRITERIA` |
| `testing-static` | `project-config-PROJECT`, `project-config-TEST-MATRIX` |
| `testing-prd` | `project-config-PROJECT`, `project-config-TEST-MATRIX`, `project-config-PRD-MANIFEST` |
| `init` | Write all entries immediately after generating or updating each file |
| Sub-agents (all) | `project-config-PROJECT` — check memory before reading; cache is usually already seeded by the coordinator |

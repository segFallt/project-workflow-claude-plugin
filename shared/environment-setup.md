## Environment Setup

Before reading `.claude/project-config/PROJECT.md`, apply the **Read-Through Protocol** from `./memory-cache.md`:

1. Check memory for an entry named `project-config-PROJECT`.
2. If found, read the memory entry, extract the stored `**pw-version:**` value, and read only line 1 of `.claude/project-config/PROJECT.md` to compare versions.
   - Versions match → use the memory content directly. Skip the full file read.
   - Versions differ → read the full file, overwrite the memory entry, and use the fresh content.
3. If not found → read the full file, write a new memory entry, and use the content.
4. If memory is unavailable → read the file directly from disk.

`PROJECT.md` contains the project architecture, repository locations, source control settings (host URL, group/org, API base), and credential loading instructions. It is your source of truth.

> **URL-encode project identifiers** in API calls — e.g., `<GROUP>/my-repo` becomes `<GROUP>%2Fmy-repo` (where applicable for the repository host).

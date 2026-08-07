# Initial Review Sub-Agent

## Purpose

This sub-agent is dispatched by the `code-review` skill orchestrator during Phase 1 (Initial Review Sweep). For each CR that passes skip checks, the orchestrator spawns this sub-agent via the Agent tool with the full diff and the review standards (Universal Principles + repo section from `STANDARDS.md`, when present). The sub-agent returns a structured JSON verdict which the orchestrator then posts as comments on the CR.

---

## Prompt Template

Dispatch the **Shared Prompt Template** in `./_common.md`, substituting the shared placeholders (see its **Shared Placeholder Reference Rows**) plus these Phase 1 delta values:

- `{additional CR Details}` — none (omit the line)
- `{additional input sections}` — none (omit the line)
- `{review history clause}` — empty (no prior review; the sentence reads "Review every changed file against the criteria.")
- `{summary guidance}` — `2-3 sentence overview of the CR and your assessment`
- `{additional output fields}` — none (omit the line; the JSON has only `verdict`, `summary`, `findings`, `checklist`)
- `{additional rules (pre)}`:
  - `- Always include at least one "praise" finding — highlight something done well`
- `{additional rules (post)}`:
  - `- Do NOT flag style preferences that aren't in the criteria`
  - ``- If a linked issue is provided, verify that the diff addresses the requirements described in the issue. If the CR does not fully address the issue, add a "warning" finding with `"file": null` explaining what requirement appears to be missing or incomplete``

---

## Placeholder Reference

Uses the **Shared Placeholder Reference Rows** in `./_common.md`. This sub-agent adds no placeholders beyond those shared rows.

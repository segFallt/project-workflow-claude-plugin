<!-- pw-version: 1.3.0 -->
# Standards

> **Note:** This file is the **single source** the init skill reads at generation time to produce a project's `STANDARDS.md` (like `TEST-MATRIX.md`, `PRD-MANIFEST.md`, and `SPEC-MANIFEST.md`). It is no longer a reference-only copy — init fills/trims it and writes it out. Keep the required headings and column shape below intact; a smoke-test check guards them.

Shared, severity-graded engineering standards. The **Universal Principles** apply to every repo; each `## {repo}` section adds standards specific to that repo. All three lifecycle skills consume this file as an **optional**, first-class input:

- **`issue-creation`** — applies **every** row when designing/scoping work (design, implementation requirements, acceptance criteria). Ignores `Severity`.
- **`development`** — applies **every** row as implementation requirements and in its design document. Ignores `Severity`.
- **`code-review`** — checks **every** row each review and reads the **`Severity`** column: for a rule-mapped finding, the row's `Severity` is the finding's **floor** — the reviewer may **escalate** a clearly worse instance but must **never silently downgrade** below it.

> **`Severity` is consumed only by `code-review`, as a floor.** `issue-creation` and `development` apply every row regardless of severity. When this file is absent, all three skills degrade gracefully.

## Universal Principles

| Category | What to check | Severity |
|----------|---------------|----------|
| Security | No hardcoded secrets, tokens, passwords, or API keys in code or config | `critical` |
| Generated files | No manual edits to files under `gen/`, `node_modules/`, `dist/`, or build output | `warning` |
| Error handling | Errors are handled, not swallowed silently; no bare `catch {}` or `except: pass` | `warning` |
| Tests | Non-trivial logic changes should include or update tests | `warning` |
| Dependencies | New dependencies are justified; no unnecessary additions | `warning` |
| SOLID | Code adheres to SOLID principles | `warning` |
| Naming | Variables, functions, and types follow the repo's established conventions | `suggestion` |
| Debug artifacts | No `console.log`, `print()` debugging, `TODO/FIXME` left in (unless clearly intentional) | `suggestion` |

---

## Per-Repository Standards

> [FILL IN] Add one section per repository. Copy the template block below for each repo. Focus on standards specific to that repo's tech stack, conventions, and common pitfalls.
>
> **What makes a good standard:**
> - Category names should be short and scannable (3-6 words)
> - "What to check" should say what to verify, not just "check X exists"
> - Include checks for the most common mistakes in this repo's tech stack
> - Include checks for project conventions that aren't obvious from the code
> - Assign each row a `Severity` (`critical`, `warning`, or `suggestion`) — its code-review floor

<!-- REPLACE THIS SECTION: Copy this block for each repository -->
## <REPO_NAME>

| Category | What to check | Severity |
|----------|---------------|----------|
| <category_name> | <what_to_verify> | `<critical\|warning\|suggestion>` |
| <category_name> | <what_to_verify> | `<critical\|warning\|suggestion>` |
<!-- Add more rows as needed -->

<!-- END REPLACE THIS SECTION -->

> Repos with no repo-specific standards (e.g. docs-only repos) do not need a section here — the Universal Principles still apply.

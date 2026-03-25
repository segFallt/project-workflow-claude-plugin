# Review Criteria

Per-repo review criteria. Read the relevant section when reviewing an MR for a given repo. The **Universal** criteria apply to all repos regardless.

## Universal

| Category | What to check |
|----------|---------------|
| **SOLID** | Code adheres to SOLID principals **critical** |
| **Security** | No hardcoded secrets, tokens, passwords, or API keys in code or config |
| **Generated files** | No manual edits to files under `gen/`, `node_modules/`, `dist/`, or build output |
| **Error handling** | Errors are handled, not swallowed silently; no bare `catch {}` or `except: pass` |
| **Naming** | Variables, functions, and types follow the repo's established conventions |
| **Tests** | Non-trivial logic changes should include or update tests. This is critical. |
| **Debug artifacts** | No `console.log`, `print()` debugging, `TODO/FIXME` left in (unless clearly intentional) |
| **Dependencies** | New dependencies are justified; no unnecessary additions |

---

## Per-Repository Review Criteria

> [FILL IN] Add one section per repository. Copy the template block below for each repo. Focus on checks specific to that repo's tech stack, conventions, and common pitfalls.
>
> **What makes good review criteria:**
> - Check names should be short and scannable (3-6 words)
> - Details should say what to verify, not just "check X exists"
> - Include checks for the most common mistakes in this repo's tech stack
> - Include checks for project conventions that aren't obvious from the code

<!-- REPLACE THIS SECTION: Copy this block for each repository -->
## <REPO_NAME>

| Check | Details |
|-------|---------|
| <check_name> | <what_to_verify> |
| <check_name> | <what_to_verify> |
<!-- Add more rows as needed -->

<!-- END REPLACE THIS SECTION -->

> Repos with no repo-specific criteria (e.g. docs-only repos) do not need a section here — the Universal criteria still apply.

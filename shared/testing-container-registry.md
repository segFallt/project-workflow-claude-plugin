## Container Registry Configuration

Read the **Container Registry** subsection of `PROJECT.md § Source Control` for the registry image variable names, login command, and **tag conventions**. Set these image variables in the deploy repo's `.env` before starting the stack.

**The correct tag for integration testing comes from the project's own `PROJECT.md` / release documentation — not from this skill.** Tag conventions vary by project. Common patterns (none universal):

- **Rolling development-tip tag** — the tip of `main` published under a name like `:main`, `:edge`, or `:nightly`. This is usually what integration testing should pull.
- **Immutable per-commit tag** — e.g. `:${CI_COMMIT_SHORT_SHA}` — to pin a specific build.

> **Do not assume `:latest` is the main-branch tip.** In many projects `:latest` tracks the last **stable release**, so pulling it integration-tests the wrong artifact (a release instead of the development tip). Use `:latest` for integration testing only if the project's `PROJECT.md` documents it as a rolling main-branch tag.

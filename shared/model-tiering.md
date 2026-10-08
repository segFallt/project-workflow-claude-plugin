## Model Tiering

Plugin default model tier for each sub-agent key.

| Key | Default |
|-----|---------|
| `code-exploration` | `sonnet` |
| `doc-authoring` | `sonnet` |
| `test-writing` | `sonnet` |
| `implementation` | `inherit` |
| `review-feedback` | `inherit` |
| `bug-fix` | `inherit` |
| `code-review-initial` | `inherit` |
| `code-review-re-review` | `inherit` |

A project overrides these per key in `PROJECT.md § Agent Model Tiering`. Partial tables are allowed: an unlisted key, or a section holding the not-configured marker (`skills/init/references/file-generation-rules.md` § Not-Configured Marker), falls through to steps 2–3 below. Values are aliases only: `haiku` | `sonnet` | `opus` | `inherit`.

### Resolving `model` at dispatch

Every Agent-tool dispatch passes `model` resolved for its tier key as below; omit the parameter when it resolves to `inherit`. Never pick a sub-agent model any other way. Apply in order; the first step that decides wins:

1. **Project override.** Read `.claude/project-config/PROJECT.md § Agent Model Tiering`. If it lists the key, use that value as-is (not capped).
2. **User setting.** Run `printenv CLAUDE_CODE_SUBAGENT_MODEL`. If it prints a value other than `inherit`, omit `model` so the user's setting applies.
3. **Plugin default, capped.** Use the key's default above, but if it is a higher tier than your session model (the model named in your system prompt; `haiku` < `sonnet` < `opus`), use `inherit`. If you cannot name or rank your session model, use `inherit`.
4. **`inherit`** means omit `model`; the Agent tool accepts model names only.
5. **No key** (a dispatch without a sub-agent prompt file): omit `model`.

Degradation: a missing `PROJECT.md` or section, or a section holding the not-configured marker, skips step 1. A row with an unknown key, or a value other than `haiku` | `sonnet` | `opus` | `inherit`, is ignored: warn the user once, then fall through to step 2. Resolve each key once per run and reuse the result.

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

A project overrides these per key in `PROJECT.md § Agent Model Tiering`. Partial tables are allowed: an unlisted key, or a section holding the not-configured marker (`skills/init/references/file-generation-rules.md` § Not-Configured Marker), keeps its default. Values are aliases only: `haiku` | `sonnet` | `opus` | `inherit`.

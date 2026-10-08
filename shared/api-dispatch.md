Read `.claude/project-config/PROJECT.md § Source Control` to determine the repository host: GitLab → `gitlab`, GitHub → `github`, Gitea → `gitea`. Then set:

```sh
API_SKILL="<plugin root stated by the invoking skill>/skills/<host>-api/SKILL.md"
```

Do not invoke `<host>-api` or read its SKILL.md whole. Extract only the sections below with Bash, and use **only** the operations the invoking skill declares (its "Operations used by this skill" list).

**Read set**

| Section | When |
|---------|------|
| `## Authentication`, `## Project/Repo Identification` | Always |
| `### N. <OPERATION>` | Each declared operation, matched by name (ignore `N`) |
| `## Pagination` | The operation is named in the Pagination section's "When to paginate" line (check with `grep -n 'When to paginate' "$API_SKILL"`), or its own section says "Pagination required" |
| `## Inline Comment Position Object` + `GET_CR` | `POST_CR_INLINE_COMMENT` |
| `## Field Reference` | The invoking skill cites it |
| Referenced operations | An extracted section names another operation (`NAME`, or gitea `§N`): extract that one too, one level only. `§N` is the `### N.` heading (numbers are uniform across hosts): match `^### N\. ` |

**Extractors** (fence-aware; each stops at the next heading of the same or higher level):

```sh
# operation, by name
awk -v op="CREATE_ISSUE" '/^```/{f=!f} !f&&/^##+ /{ if(p){exit} if($0 ~ "^### [0-9]+\\. "op"[[:space:]]*$"){p=1} } p' "$API_SKILL"
# top-level section (includes its ### subsections)
awk -v s="Pagination" '/^```/{f=!f} !f&&/^## /{ if(p)exit; if($0=="## "s)p=1} p' "$API_SKILL"
```

If `API_SKILL` does not exist or an extractor prints nothing, stop and report the missing file or section — do not guess the API call.

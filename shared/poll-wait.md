## Poll Wait

Wait for a change request's CI or review activity without spending model turns. The bundled script polls the host (GET only) and returns only when the watched state changes or a chunk ends.

### Command

Run as **one foreground Bash call** with `timeout: 600000`, on one line and as the whole command (no `source`, `cd` or `&&` around it, so the pre-approved permission rule matches). Never use `run_in_background`, `Monitor`, or `sleep` loops.

```bash
python3 <PLUGIN_ROOT>/scripts/poll-until-change.py --host <host> --watch <pipeline|cr-activity> --api-base <API_BASE_URL> --cr <project>:<iid> [--cr ...] --token-env <TOKEN_ENV_VAR> --env-file <ENV_FILE_PATH> [--ignore-self] [--fingerprint '<last fingerprint>'] --max-wait <MAX_WAIT>
```

- `<PLUGIN_ROOT>`: the `Plugin root:` line of the invoking skill.
- `<host>`: `gitlab`, `github` or `gitea`, per the `PROJECT.md § Source Control` platform. `<API_BASE_URL>`: that section's API base.
- `<project>`: the unencoded project path (`<GROUP>/<repo>` or `<OWNER>/<repo>`). `<iid>`: the CR number.
- `--token-env` takes the variable **name**; the script reads the value from the environment, or from `--env-file` when unset. Never pass a token.
- `--ignore-self`: activity by the token's own identity (replies, resolves) does not count as a change.
- `<MAX_WAIT>`: `540`, or the seconds left in the caller's wait budget if fewer. The chunk, start-up included, ends within it.
- Without `--fingerprint`, or for a `--cr` missing from it, the current state is returned at once. A fingerprint from the other `--watch` kind never matches, so keep one per kind.

### Result

stdout is one JSON object: `fingerprint`, `changed[]`, `elapsed_s`, and `targets` keyed `<project>:<iid>`, each with its own `fingerprint` entry and a `summary`:
- `pipeline`: `status` (`none`, `running`, `success`, `failed`, `canceled`, `skipped` = CI did not run), `terminal`, `sha`
- `cr-activity`: `state` (`open`, `merged`, `closed`), `head_sha`, `latest_activity`

| Exit | Meaning | Action |
|------|---------|--------|
| `0` | Changed (or first read) | Persist the fingerprint; act on the `changed` targets |
| `2` | Chunk ended with no change | Re-invoke with the same `--fingerprint` and `--max-wait` = min(540, budget left) until the caller's wait budget (sum of `elapsed_s`) is spent |
| `3` | Token rejected repeatedly | Stop waiting; tell the user the token was rejected and wait for guidance |
| `4` | Bad arguments or unknown CR | Fix the arguments; never re-run unchanged |

Transient errors (401/5xx/network) are retried and logged to stderr; report them only with exit `3` or `4`.

# Cost baseline runner (#68)

Measures token use and cost of typical project-workflows skill runs. It runs real `claude -p` sessions headlessly against a throwaway GitLab sandbox. The results are the baseline for later cost-control work.

> **This spends real money.** Every run is a paid model session. Each scenario has its own `maxBudgetUsd` cap, and `COST_EVAL_MAX_TOTAL_USD` caps a whole `baseline` or `listing-ab` command. This is **not a CI gate**, and `.ci/` never ships with the plugin.

## Prerequisites

- `bun` (`~/.bun/bin/bun`) and `bun install --cwd .ci --frozen-lockfile`
- `claude` CLI logged in (`claude --version`)
- For write scenarios: a seeded sandbox clone (see `seed`)

## Isolation

Each run spawns:

```
claude -p --input-format stream-json --output-format stream-json --verbose \
  --permission-mode manual --permission-prompt-tool stdio --max-budget-usd <cap> \
  --setting-sources user --settings '{"enabledPlugins":{...:false}}' \
  --plugin-dir <plugin root> [--model <m>]
```

The cwd is always outside `/workspace`. Write runs use the sandbox clone; read-only runs use a fresh temp dir, which is deleted afterwards. The runner reads the first `system/init` event. It aborts the run unless exactly one `project-workflows` plugin is loaded, and that plugin's path must be the intended plugin root. Every tool permission arrives as a `can_use_tool` control request. Normal tools are allowed as-is and counted. `AskUserQuestion` gets answers from the scenario's `askAnswers` list.

The sandbox write guard only sees tool calls that reach the runner as `can_use_tool` requests. The runner passes `--permission-mode manual` (the CLI's prompting mode; it has no `default` choice) so nothing is auto-approved. Because `--setting-sources user` still loads `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`; override with `COST_EVAL_USER_SETTINGS`), write scenarios refuse to start if that file sets `permissions.defaultMode` to `bypassPermissions`, `acceptEdits`, `dontAsk` or `auto`, or has a `Bash`/`Monitor` rule in `permissions.allow`, or configures a `PreToolUse` or `PermissionRequest` hook (either can approve a call before the stdio prompt). The guard checks every tool call whose input has a `command` (Bash, Monitor, ...).

The guard needs each write's target to be visible in the same command. A `git push` aimed only at a remote name (`origin`) or at a variable set in an *earlier* Bash call (`git push "$PUSH_URL" x`) is refused with "does not target the sandbox". That is the safe direction, and it is why the skills' push only passes when `PUSH_URL` is defined inline in the same command. The post-guard runs did exactly that. If a future re-run aborts at a push step, check this first.

## Sandbox rule

Write scenarios run only when both checks pass:

- the cwd's `origin` remote is `COST_EVAL_PROJECT` (https, ssh, or a URL with credentials)
- its `.claude/project-config/PROJECT.md` names that group and repo

The guard also refuses write scenarios in temp dirs.

## Commands

Run these from the repo root:

```sh
bun .ci/evals/cost/run.ts probe          # one haiku call ($0.10 cap): checks isolation and prints init/plugins/cost
bun .ci/evals/cost/run.ts seed [--work-item "#73"]   # clone the sandbox and commit sandbox/payload on chore/seed-cost-eval; prints push/MR steps (never pushes)
bun .ci/evals/cost/run.ts listing-ab [--runs 3] [--model haiku]
bun .ci/evals/cost/run.ts baseline [--scenario <id>]... [--runs 3] [--model <m>] [--var NAME=value]... [--ci-delay <seconds>]
bun .ci/evals/cost/run.ts report [results/baseline-<date>.json]
bun .ci/evals/cost/run.ts curate curation-<date>.json   # final baseline from hand-validated runs (embeds summaries)
```

Exit codes: `0` means every run passed, `1` means at least one run failed or the global cap stopped the command, and `2` means a fatal error.

`--ci-delay <seconds>` (baseline only) slows the sandbox pipeline so waits are long enough to measure: the sandbox CI job runs `sleep ${CI_DELAY:-0}` before its checks. The **runner itself**, not the model, sets the sandbox project's CI/CD variable `CI_DELAY` through the GitLab API before the first scenario and deletes it in a `finally`, even when a run fails (a failed delete is printed as a warning; delete it by hand then). It uses `API_TOKEN_ENV_VAR` and `REPO_HOST_URL` from `COST_EVAL_ENV_SOURCE` (Maintainer on the sandbox), and the client (`lib/gitlab.ts`) refuses any project but `COST_EVAL_PROJECT`. If you interrupt the command (Ctrl-C), delete the variable by hand. The model's commands are unchanged and the write guard is not involved.

`--work-item "#<iid>"` (seed only) is the work item the seed commit message and the printed MR title cite (default `#68`).

`baseline` runs the scenarios in this order: `work-item-create`, `work-item-refine`, `development`, `code-review`, `gitlab-api-lookup`. Before each run, it checks that the money spent so far plus that run's `maxBudgetUsd` stays within `COST_EVAL_MAX_TOTAL_USD`. If not, it stops.

Scenario prompts can use the template variables `{{SEED_ISSUE_IID}}`, `{{CREATED_ISSUE_IID}}`, and `{{DEV_MR_IID}}`. The runner fills them from `out/context.json`. `{{PLUGIN_ROOT}}` is always the plugin under test (`COST_EVAL_PLUGIN_DIR`) and overrides any `--var`. Scenario `capture` rules write values there, and you can also pass them with `--var`. If a variable is missing, that run fails before any model call. Repeat runs of `development` and `code-review` act on the same sandbox issue and MRs, so reset the sandbox (close the MRs, delete the branches) between rounds if you want comparable runs.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `COST_EVAL_SANDBOX_DIR` | `~/cost-eval/agent-sandbox` | Sandbox clone (cwd for write runs) |
| `COST_EVAL_PLUGIN_DIR` | repo root (resolved from this script) | Plugin under test (`--plugin-dir`) |
| `COST_EVAL_PROJECT` | `code-agent-workspace/agent-sandbox` | Only project write runs may target |
| `COST_EVAL_MAX_TOTAL_USD` | `60` | Global spend cap per command |
| `COST_EVAL_DISABLE_PLUGINS` | the four installed plugins | Comma list of `name@marketplace` to disable |
| `COST_EVAL_RUN_TIMEOUT_MIN` | `60` | Wall-clock limit per run |
| `COST_EVAL_ENV_SOURCE` | `/workspace/.claude/project-config/.env` | `seed`: source of `API_TOKEN_ENV_VAR`, `REVIEW_TOKEN_ENV_VAR`, `REPO_HOST_URL`; `baseline --ci-delay`: source of `API_TOKEN_ENV_VAR` and `REPO_HOST_URL` |
| `COST_EVAL_CLONE_URL` | `https://gitlab.n3.pingleberry.com/<project>.git` | `seed`: clone URL |
| `GIT_USER_NAME` / `GIT_USER_EMAIL` | — | `seed`: commit identity (passed with `-c`, never written to git config) |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Where session transcripts are read from |

## Scenarios (`scenarios/*.json`)

`id`, `description`, `writes`, `cwd` (`sandbox`|`temp`), `prompt`, `followUps[{match, reply, repeat?}]`, `askAnswers[{question, answer}]`, `endWhen{assistantMatches?, maxTurns?, afterFollowUp?, toolCommandMatches?, toolCommandAfter?}`, `maxBudgetUsd`, `model?`, `capture[{var, pattern, required?}]?`. Patterns are JS regexes, and a leading `(?i)` makes one case-insensitive. An `answer` of `"$first"` picks the first option. For multiSelect questions, list the labels separated by commas.

After each turn, the run ends successfully if `endWhen` holds. `afterFollowUp` is an index into `followUps`: the run ends after the turn that answers that reply. `endWhen.toolCommandMatches` is checked **inside** a turn: when the model issues a tool call whose `command` matches (and, with `toolCommandAfter`, only once an earlier command matched that), the runner stops the process and the run ends successfully. The skills wait on CI and review activity in foreground poll-script chunks within one turn, so `development` ends when the first `--watch cr-activity` wait starts (CI is terminal), and `development-review-round` ends when one starts after a reply or resolve. Such a run's summary has `endedMidTurn: true`: `total_cost_usd` and `turnCosts` miss the partial last turn, while the transcript token totals include it. Otherwise the runner sends the first usable follow-up that matches. The run fails if:

- no follow-up matches (unscripted pause)
- the model asks a question that no `askAnswers` entry matches
- a turn returns an error result, including a budget overrun
- the timeout passes
- the plugin isolation check fails
- in a `writes: true` scenario, a command would write to a project other than the sandbox. The sandbox write guard checks every tool request that carries a `command` (Bash, Monitor, …). It counts as a write: a `curl` with a write method or any body/upload flag, `git push`, or a `glab`/`gh`/`tea` command. The guard refuses the call and fails the run.
- user settings could auto-approve tools: a `defaultMode` that skips prompts, a Bash/Monitor allow rule, or a configured `PreToolUse` hook. The run refuses to start; see Isolation.
- stdout had unparseable lines, or `claude` exited non-zero, even though the driver reached its end condition

`capture` with `required: true` fails a run that never produced the value, for example an issue that was never created. Clear `out/context.json` between rounds so stale iids can't leak into the next scenario.

Scenario notes:

- `work-item-create` needs a unique `--var CREATE_OP=<op>` per run. Reusing a title trips the skill's duplicate check, so nothing gets created.
- `development` and `development-review-round` act on seeded sandbox issues (`--var SEED_ISSUE_IID`). Don't merge their MRs until the round, including `code-review`, has finished. Their text `endWhen` and follow-ups still match the older background-poll behaviour, so a run on a pre-#73 plugin (the "before" measurement) ends the same way as before.
- `subagent-exploration` is read-only. It needs `--var SUBAGENT_MODEL=<opus|sonnet|haiku>` and measures a single code-exploration dispatch (#70).
- `gitlab-api-lookup-dispatch` is read-only and opt-in (not in the `baseline` order; run it with `--scenario gitlab-api-lookup-dispatch`). It resolves `CREATE_ISSUE` through `shared/api-dispatch.md`'s section reads instead of loading the whole `gitlab-api` skill, for comparison with `gitlab-api-lookup` (#71).
- `development-review-round-merge-probe` and `development-review-round-explicit-merge` (#76) are opt-in, not in the `baseline` order. Both resume a sandbox review round like `development-review-round` but drop its "do not merge" clause. Follow-ups are first-match, so the rule for the post-review status/readiness report comes first. The probe answers that report with "Proceed with your recommendation." and must not merge. The explicit variant answers `merge !{{DEV_MR_IID}}` and should merge at the reported head (`captured.REPORTED_HEAD_SHA`). Each run ends after the turn that answers the report. Check the MR's state on the host, or look for a `/merge` call in `events.jsonl`. `captured.MERGE_CLAIM` is only a text heuristic.

## Re-seeding the sandbox

Do this after a payload change (for example the `CI_DELAY` sleep in `sandbox/payload/.gitlab-ci.yml`). `seed` only clones, copies the payload and commits; the rest is manual:

1. `bun .ci/evals/cost/run.ts seed --work-item "#<this work item>"`, with `GIT_USER_NAME`/`GIT_USER_EMAIL` set.
2. Run the printed push command. It defines the token URL inline; never add `-u`.
3. Run the printed `curl` to open the MR from `chore/seed-cost-eval` to `main`, and have it merged.
4. `git -C <sandbox> checkout main && git -C <sandbox> pull`.
5. Recreate the seed issue(s) from `sandbox/seed-issue.md` and pass the new iid with `--var SEED_ISSUE_IID=<iid>`. Close stale MRs and delete stale branches from earlier rounds.

## Reference baselines and variance bands

Results and findings are **not committed**. `results/`, `out/` and curation files are gitignored. Each baseline belongs to the work item that produced it: post the findings there, and attach the `baseline-final` JSON and its curation file. The current reference is on #68.

To publish a reference baseline:

1. Validate each run by hand: did it do what the scenario intends?
2. Write a curation file (`{"date", "include": [runIds], "exclude": [{"runId", "reason"}]}`).
3. Run `bun run.ts curate <curation file>`. This writes `results/baseline-final-<date>.json`, which embeds the run summaries.
4. Attach both files to the work item.

**Variance band per scenario:** take the observed spread ((max − min) / median), round it up to the next 5%, and apply a floor of ±10%. With N=1 the band is ±50% (provisional). A rerun **reproduces** the reference when its median cost falls within the band around the reference median.

Compare only at the same coordinator model and a similar CLI version. Token counts drift by about ±100 between sessions, for example from claude.ai account connectors and system prompt changes.

## Output

- `out/<timestamp>-<scenario>-<n>/`: `events.jsonl` (every stream event, plus the messages the runner sent as `{"_sent": ...}`), `summary.json`, and `transcripts/` (raw session JSONL files, including sub-agent files). `out/` is git-ignored.
- `results/<kind>-<YYYY-MM-DD>.json`: one file per `baseline`, `listing-ab` or `curate` (`baseline-final`) command. If a file for that date exists, a `-2`, `-3`, … suffix is added. Each run in it records:
  - scenario, `ok`/`reason`, `total_cost_usd`, `turnCosts`
  - `results[]` (per turn: usage, modelUsage, num_turns, permission_denials)
  - `tokens` (coordinator and per-sub-agent input/output/cache-write/cache-read)
  - `toolCounts`, `plugins`, `model`, `claudeVersion`, `pluginSha`, `cacheNote`
  - `aggregates` (median/min/max)

The transcript token totals are authoritative. They come from keeping the last line of each API message and summing its four `usage` fields. `total_cost_usd` is the CLI's running cost estimate.

## Tests

```sh
bun test ./.ci/evals/cost
```

Write the path with the leading `./`. Bun skips dot-directories when it gets a bare filter like `.ci/evals/cost`. The tests use recorded fixtures with fake values. They make no network or model calls.

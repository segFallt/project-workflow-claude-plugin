# Software Design Document — Cost Controls for Skill Execution

> Documents the cost model of this plugin's skills, the levers adopted and rejected to lower it, and how cost is measured, so later skill changes keep these properties. Implements the [PRD](../product/cost-controls.md). The design is non-trivial (tier resolution, section-targeted reads, a poll-script contract), so an SDD accompanies the PRD under the `standard` documentation profile. Written as it stands once the feature's items have landed.

## Overview

The plugin's skills are coordinators that dispatch sub-agents and wait on CI and review activity. Cost comes from the model each turn runs on and from how much context each turn re-reads. The design applies three levers and rejects others:

- **Sub-agent tiering.** Each sub-agent role has a default model tier. A project can override it. Code-writing and approval roles keep the session model.
- **Poll offload.** A bundled script does the waiting. The coordinator spends one turn per wait chunk, not one per poll.
- **Section-targeted reads.** Coordinators extract the needed sections of a host-API skill with Bash instead of loading it whole.

A fourth rule, merge only on explicit instruction, comes from a behaviour the baseline exposed. It is a safety rule rather than a cost lever.

Model choices are plugin defaults that a project overrides through `PROJECT.md § Agent Model Tiering`. Every lever is measured against a recorded baseline (see Measurement method).

## Cost drivers

The baseline findings are in the #68 findings comment, with variance bands and data attached to it. This section gives the qualitative model and does not copy the numbers.

- **Long coordinator sessions are cache-read bound.** Each turn re-reads the growing context, so `development` spends most of its tokens on cache reads. Fewer coordinator turns lower cost more than shorter turns do.
- **Sub-agent fan-out.** Work fans out once per item (`work-item` refine), per change request (`code-review`), per failure (testing bug-fix) and per repository or unit (`development`). Before tiering, sub-agent models were unpinned: often the session model, usually the most expensive, and sometimes picked ad hoc, so read-heavy work was not reliably on a cheaper tier and code-writing work sometimes ran on a weaker one. The baseline shows a read-only exploration sub-agent on a smaller model costing markedly less for the same core findings.
- **Whole-file reference loads.** Loading a host-API skill through the Skill tool pulls about 680 to 850 lines into context for one operation. The cost is mostly cache writes for the whole skill.
- **Polling turns.** A timed poll loop makes every poll a full coordinator turn on the session model, with the large context re-read each time.

Skill descriptions are not a driver. The baseline measured no first-turn tokens from the whole plugin in `-p` mode.

## Architecture

Three independent mechanisms, each behind one shared module or script:

| Lever | Home | Consumed by |
|-------|------|-------------|
| Sub-agent tiering | `shared/model-tiering.md` | Every dispatch boilerplate (7 sites) and the dispatching skills' pointers |
| Section-targeted reads | `shared/api-dispatch.md` | Skills that call a repository-host operation |
| Poll offload | `scripts/poll-until-change.py` and `shared/poll-wait.md` | `development`, `code-review`, the testing skills |

The measurement runner in `.ci/evals/cost` sits outside the shipped plugin and exercises all three.

## Components

### Tier table and resolution (`shared/model-tiering.md`)

Holds the default table (key to alias) and the resolution rule. Values are plain aliases: `haiku`, `sonnet`, `opus`, `inherit`. Read-heavy roles (`code-exploration`, `doc-authoring`, `test-writing`) default to `sonnet`. Code-writing and approval roles (`implementation`, `review-feedback`, `bug-fix`, `code-review-initial`, `code-review-re-review`) default to `inherit`. The table lives in one module so `init` can show it without duplicating it. Tracked in #69 (table, `PROJECT.md` section, `init` migration) and #70 (resolution rule, dispatch sites).

Rationale: the largest measured saving comes from running read-heavy sub-agents on a smaller model, and the quality-sensitive roles are the ones where a cheaper model risks worse code or weaker approval decisions.

### Host-API section reads (`shared/api-dispatch.md`)

Builds the path to the host skill file from `PROJECT.md § Source Control` and the plugin root the invoking skill states. It never invokes or reads the whole file. It extracts, with two fence-aware `awk` extractors that stop at the next heading of the same or higher level:

- `## Authentication` and `## Project/Repo Identification`, always.
- Each `### N. <OPERATION>` the skill declares in its "Operations used by this skill" list, matched by name with the number ignored.
- `## Pagination` when the operation is named in the "When to paginate" line or its own section requires pagination.
- `## Inline Comment Position Object` and the `GET_CR` operation for `POST_CR_INLINE_COMMENT`.
- `## Field Reference` when the skill cites it.
- Operations an extracted section references, one level deep.

Rationale: a lookup then loads a small fraction of the file, which removes most of the cache-write cost of a lookup. Tracked in #71, which also adds `LIST_ISSUE_COMMENTS`, an operation `development` needs and no host skill had. The smoke test checks that the host-API anchors the extractors rely on exist.

### Plugin root rule

Each consuming `SKILL.md` states `Plugin root: ${CLAUDE_PLUGIN_ROOT}`. The platform substitutes the variable in a plugin skill's markdown and in its `allowed-tools` rules, but not in `shared/` files read with the Read tool, and does not export it to the model's Bash. Shared modules therefore say "the plugin root stated by the invoking skill". Tracked in #71 and #73.

### Poll script (`scripts/poll-until-change.py`)

A Python standard-library script that owns the per-host logic. The coordinator passes identifiers only. It is GET-only and writes no files. See Interfaces & contracts. Tracked in #73.

### Explicit-merge rule (`skills/development`)

`development` never proposes a merge. A catch-all reply ("proceed", "go ahead") and the model's own recommendation are never consent. It calls `MERGE_CR` only on an explicit instruction naming the change request, in reply to a readiness report, and runs the checks in `references/explicit-merge.md` first. Tracked in #76.

## Data flow

**Dispatch.** A coordinator reaches a dispatch site with a tier key. It resolves the model once per key per run:

1. The `PROJECT.md § Agent Model Tiering` row for the key is used as written and is not capped. A missing file or section skips this step. An unknown key or invalid value is ignored with one warning and falls through.
2. If the user's `CLAUDE_CODE_SUBAGENT_MODEL` is set and is not `inherit`, `model` is omitted so the user's setting applies. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` overrides everything at the platform level.
3. Otherwise the plugin default applies, unless it is a higher tier than the session model (`haiku` < `sonnet` < `opus`) or the session model cannot be ranked. Then the result is `inherit`.
4. `inherit` means `model` is omitted, because the Agent tool accepts model names only.
5. A dispatch with no tier key omits `model`. The coordinator never picks a model ad hoc.

The session model is the one named in the coordinator's system prompt. This is observed behaviour, not documented, because no documented way exists for a skill to read its own model. If the coordinator cannot name it, the cap yields `inherit`.

**Waiting.** After a push or while awaiting review, the coordinator runs the poll script once in the foreground with the previous fingerprint. On exit 0 it acts on the reported change. On exit 2 it re-invokes with the same fingerprint until the wait budget is spent. On exit 3 or 4 it stops.

**Section read.** The skill resolves the host, builds `API_SKILL`, runs the extractors for its declared operations, and uses only the extracted text.

## Interfaces & contracts

### Poll script

```
python3 <plugin root>/scripts/poll-until-change.py \
  --host gitlab|github|gitea --watch pipeline|cr-activity \
  --api-base URL --cr <project>:<iid> [--cr ...] --token-env VAR \
  [--env-file P] [--ignore-self] [--fingerprint '<prev>'] \
  [--max-wait 540] [--interval s] [--max-interval 300] [--max-auth-failures 3]
```

- **Inputs.** The token is read from the named environment variable or the env-file, never from an argument.
- **Output.** JSON on stdout: `fingerprint`, `changed[]`, `elapsed_s`, and `targets` keyed `project:iid`, each with its own fingerprint and a summary.
- **Pipeline summary.** `status` (`none`, `running`, `success`, `failed`, `canceled`, `skipped`), `terminal`, `host_status`, `sha`.
- **Activity material.** Change request state (`open`, `merged`, `closed`), head SHA and the latest foreign note or resolve timestamp. `--ignore-self` excludes the token identity's own activity, resolved from the token at start-up.
- **Fingerprint.** A digest of sorted-key JSON, one `project:iid=hash` entry per target. A fingerprint from the other `--watch` kind never matches, so coordinators keep one per kind.
- **Exit codes.**

| Code | Meaning | Coordinator action |
|------|---------|--------------------|
| 0 | Changed, or first read (no `--fingerprint`, or a `--cr` missing from it) | Act on `changed[]` |
| 2 | Chunk ended with no change | Re-invoke with the same fingerprint and `--max-wait` = min(540, budget left) until the summed `elapsed_s` spends the budget |
| 3 | Token rejected repeatedly | Stop and tell the user |
| 4 | Bad arguments or unknown change request or host | Do not re-run unchanged |

- **Retries.** 401, 403, 429, 5xx and network errors are retried with backoff (default 60 s for pipelines, 90 s for activity, factor 1.5, capped at 300 s) and logged to stderr. Pagination is capped at 50 pages.
- **Time.** The deadline includes start-up, and each request is clamped to the time left.
- **GET-only.** `request()` refuses any other method.

### Wait mode and permissions

`shared/poll-wait.md` requires one foreground Bash call with a 600000 ms timeout, as the whole command (no `source`, `cd` or `&&` around it, so the permission rule matches). It forbids `run_in_background`, `Monitor` and sleep loops. A skill cannot tell interactive from headless mode, and in `-p` mode background Bash is killed shortly after the result. The 540 s chunk stays under the 600 s Bash cap.

The skill's `allowed-tools: Bash(python3 ${CLAUDE_PLUGIN_ROOT}/scripts/poll-until-change.py *)` pre-approves the script only for the invoking turn. The README and the skills' Prerequisites document the permanent rule `Bash(python3 */scripts/poll-until-change.py *)` for unattended loops. `init` does not write settings.

### State fields

`loop.last_fingerprint_pipeline`, `loop.last_fingerprint_activity` and, in `code-review`, `tracked_crs[].last_fingerprint` hold the previous fingerprints. `loop.last_poll_at` is the heartbeat, updated at each chunk exit. `cr.reported_head_sha` (optional, in `shared/state-tracking.md`) records the head stated in the readiness report.

### Explicit merge

The readiness report states the head SHA and is given when no threads are open, the head differs from `cr.reported_head_sha` (or it is unset) and the latest pipeline succeeded. On an explicit instruction, `references/explicit-merge.md` is read and:

1. A fresh `GET_CR` and `GET_CR_PIPELINES` confirm the pipeline succeeded, the host reports the change request mergeable and the current head equals `cr.reported_head_sha`.
2. On failure, nothing is merged, the failed check is named and the flow returns to the Phase 6 loop.
3. `MERGE_CR` runs. GitLab pins the head with `sha`. GitHub and Gitea have no pin, so only the pre-check guards.
4. A re-fetch confirms the merge, then Phase 7 runs.

### `PROJECT.md § Agent Model Tiering`

An optional table of tier key to alias, partial tables allowed, marked `<!-- not-configured -->` when unused. It requires pw-version 1.6.0, and `init` migrates older files.

## Data model

One new optional `PROJECT.md` section and the state fields above. No other schema change. The `init` migration follows the precedent set by `## Work Item Conventions`.

## Error handling & failure modes

- **Unknown tier key or invalid value.** Ignored with one warning, then the next resolution step applies.
- **Session model unknown.** The cap yields `inherit`, so the cost saving is lost but quality is kept.
- **Host-API file or section missing.** The skill stops and reports. It does not fall back to loading the whole skill.
- **CI stuck.** `development` allows a 20-minute budget (summed `elapsed_s`) with no terminal status, then follows its CI-stuck error path. A pipeline status `none` or a SHA other than the pushed head counts as running. `canceled` counts as failed. `skipped` means CI produced no result: the skill tells the user and waits for guidance instead of starting a fix cycle.
- **Token rejected.** Exit 3: the skill stops and tells the user, since retrying cannot help.
- **Bad arguments.** Exit 4: the skill fixes the call or reports, and never re-runs unchanged.
- **Head changed before merge.** The explicit merge is refused, and the skill returns to the readiness loop.
- **Poll permission missing in an unattended loop.** The call is denied after the invoking turn. The documented `permissions.allow` rule prevents this.

## Alternatives considered

Each rejected lever was weighed and dropped for the stated reason.

- **Skill frontmatter `model:` / `effort:`.** Rejected. The override is static, so `PROJECT.md` cannot change it. It is turn-scoped, and a reference skill loaded mid-turn switches the invoking coordinator's model for the rest of the turn. That switch is also a full prompt-cache miss on the whole conversation. Savings come from dispatch tiering instead. Tracked in #70.
- **`disable-model-invocation` as a cost lever.** Rejected. The baseline measured no first-turn tokens from the plugin in `-p` mode, so there is nothing to save. The interactive effect was not measured. Tracked in #72, closed as won't-do.
- **`${CLAUDE_PLUGIN_ROOT}` inside `shared/` files.** Rejected. It is not substituted on Read and not exported to Bash. Hence the per-`SKILL.md` `Plugin root:` line. Tracked in #71.
- **The undocumented "Base directory for this skill" header as the path source.** Rejected. It is not a documented contract, so the design does not rely on it. Tracked in #71.
- **Background or `Monitor` waiting for the poll script.** Rejected. A skill cannot tell interactive from headless mode, and background Bash is killed shortly after the result in `-p`. Foreground chunks work in both. Tracked in #73.
- **Letting the coordinator choose sub-agent models ad hoc.** Rejected. The baseline saw an implementation sub-agent run on Haiku in one run. Unkeyed dispatches pass no model instead, so they use `CLAUDE_CODE_SUBAGENT_MODEL` if set, else the session model. Tracked in #70.

## Measurement method

The `.ci/evals/cost` runner (built in #68, not shipped, and independent of the STANDARDS eval harness) runs real `claude -p` sessions and spends real money. Each scenario has a budget cap and each command a total cap. It is not a CI gate.

- **Isolation.** Sessions run headless over stream-json, with `--permission-mode manual` and a stdio permission prompt tool so every tool call is a counted request. User settings are the only setting source and the installed plugin is disabled in settings. The plugin under test loads through `--plugin-dir`. The runner aborts unless exactly one project-workflows plugin loads, from the intended root. The working directory is outside the workspace: a sandbox clone for write runs, a temp directory for read-only runs.
- **Sandbox and write guard.** Write scenarios target a dedicated throwaway project, `code-agent-workspace/agent-sandbox`. The guard checks every tool call that carries a command. A write is a `curl` with a write method or body, `git push`, or `glab`/`gh`/`tea`. The runner refuses the call and fails the run if the target is not the sandbox. The target must be visible in the same command, so a push to `origin` or to a variable set in an earlier call is refused. Write runs also require `origin` and `PROJECT.md` to name the sandbox, and refuse to start if user settings auto-approve edits or tools, allow Bash or Monitor by rule, or define permission hooks.
- **CI delay.** `--ci-delay` sets a sandbox CI/CD variable through the API before the run and always deletes it afterwards, so pipelines last long enough to exercise the poll script.
- **Scenario scripting.** A scenario scripts first-match follow-up replies and AskUserQuestion answers and sets an end condition. Pitfalls:
  - `work-item-create` needs a unique title per run. A reused title trips the duplicate check and nothing is created.
  - End conditions must be strict. A mid-turn end means cost and per-turn figures miss the partial turn.
  - Catch-all replies such as "Proceed with your recommendation." must not lead to a merge. The merge probe scenarios check this. Tracked in #76.
  - Do not merge sandbox change requests until the round, including `code-review`, has finished, and reset the sandbox between rounds.
- **Variance-band rule.** Band = (max - min) / median, rounded up to the next 5%, with a floor of 10%. A single run gives a provisional band of 50%. A rerun reproduces the reference when its median falls inside the band around the reference median. Compare only at the same coordinator model and a similar CLI version. Transcript token totals are authoritative, and the reported cost is the CLI's estimate.
- **Success is judged per lever.** Only the scenario a lever targets must beat its band: sub-agent exploration for tiering, the host-API lookup for section reads, and coordinator turns and cache reads in `development` with a CI delay for poll offload. `development` and `code-review` overall must stay within or below their band. Pinning `implementation` to the session model can raise `development` cost relative to a baseline where it ran on a cheaper model ad hoc. That rise is reported and attributed, and is not a failure.
- **Findings and data live on work items, not in the repo.** Results, run output and curation files are gitignored. Baselines and after-change figures are posted on the work item, and curated data is attached there. Link them, and do not copy the tables into documents.

## Behavioural notes

These came from the baseline and affect how to read cost figures:

- Coordinators skip delegation on very small code, and do so inconsistently. A run that does not delegate costs differently from one that does, which widens variance.
- `code-review` Phase 1 lists change requests group-wide, so its cost scales with activity across the group, not with the one change under review.
- `development` merged a change request on its own in the baseline. This is why the explicit-merge rule exists.

## References

Checked 2026-10-06.

- Skill frontmatter: [skills#frontmatter-reference](https://code.claude.com/docs/en/skills#frontmatter-reference)
- String substitutions: [skills#available-string-substitutions](https://code.claude.com/docs/en/skills#available-string-substitutions)
- Who can invoke a skill: [skills#control-who-invokes-a-skill](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill)
- Pre-approving tools: [skills#pre-approve-tools-for-a-skill](https://code.claude.com/docs/en/skills#pre-approve-tools-for-a-skill)
- Sub-agent model resolution: [sub-agents#choose-a-model](https://code.claude.com/docs/en/sub-agents#choose-a-model)
- Forcing one sub-agent model: [sub-agents#run-every-subagent-on-one-model](https://code.claude.com/docs/en/sub-agents#run-every-subagent-on-one-model)
- Model aliases: [model-config#model-aliases](https://code.claude.com/docs/en/model-config#model-aliases)
- Model environment variables: [model-config#environment-variables](https://code.claude.com/docs/en/model-config#environment-variables)
- Plugin environment variables: [plugins-reference#environment-variables](https://code.claude.com/docs/en/plugins-reference#environment-variables)
- Bash timeouts: [tools-reference#timeout-and-output-limits](https://code.claude.com/docs/en/tools-reference#timeout-and-output-limits)
- Foreground commands moving to the background: [tools-reference#foreground-commands-that-move-to-the-background](https://code.claude.com/docs/en/tools-reference#foreground-commands-that-move-to-the-background)
- Background tasks at exit in `-p`: [headless#background-tasks-at-exit](https://code.claude.com/docs/en/headless#background-tasks-at-exit)
- CLI flags: [cli-reference#cli-flags](https://code.claude.com/docs/en/cli-reference#cli-flags)
- Model switches and the cache: [prompt-caching#switching-models](https://code.claude.com/docs/en/prompt-caching#switching-models)
- Sub-agents and the cache: [prompt-caching#subagents-and-the-cache](https://code.claude.com/docs/en/prompt-caching#subagents-and-the-cache)
- Reducing token usage: [costs#reduce-token-usage](https://code.claude.com/docs/en/costs#reduce-token-usage)
- Why usage climbs in a long session: [costs#why-usage-climbs-in-a-long-session](https://code.claude.com/docs/en/costs#why-usage-climbs-in-a-long-session)
- Pricing, prompt caching: [pricing#prompt-caching](https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching)
- Pricing, models: [pricing#model-pricing](https://platform.claude.com/docs/en/about-claude/pricing#model-pricing)

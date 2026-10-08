## Explicit Merge

Run this only when the user explicitly instructs you to merge this CR, in reply to a readiness report (see `SKILL.md` § Role & Objective). Anything less is not consent: keep waiting.

1. **Fresh checks**, immediately before merging: call `GET_CR` and `GET_CR_PIPELINES`. All must hold:
   - the latest pipeline succeeded
   - the host reports the CR mergeable (GitLab `detailed_merge_status: mergeable`; GitHub/Gitea `mergeable: true` — GitHub `null` means still computing and counts as not mergeable)
   - `cr.reported_head_sha` is set and the CR's current head SHA (GitLab `diff_refs.head_sha`/`sha`; GitHub/Gitea `head.sha`) equals it — nothing was pushed since the user saw the readiness report
2. **If any check fails:** do not merge. Tell the user which check failed (e.g. "the head moved from `{reported}` to `{current}`", "pipeline `{status}`", "not mergeable: `{reason}`"). When the head moved, give a fresh readiness report only once the CR is ready again; a new merge instruction must follow it. Return to the Phase 6 loop.
3. **Merge** via `MERGE_CR`, passing `cr.reported_head_sha` as the head pin where the host's recipe has one (GitLab `sha`). On GitHub/Gitea the recipe has no pin, so step 1's SHA comparison is the only guard.
4. **Confirm:** re-fetch with `GET_CR` and check the CR's state is merged (Gitea's merge returns an empty body). If it is, notify the user and proceed to Phase 7; otherwise report the host's response and return to the Phase 6 loop.

Multi-repo: the dependency-order rule in `SKILL.md` § Multi-Repo Change Coordination still applies — never merge a downstream CR before its upstream.

### Phase 3: Bug Triage & Fix Cycle

**Entry condition:** Phase 2 complete with at least one FAIL.
**Exit condition:** All FAILs have a CR or are classified as WONTFIX (with user approval).

For each FAIL:

1. **Diagnose** — Read logs (`docker logs <container> --tail 200`), check config, trace the error
2. **Classify severity:**
   - **critical** — Service won't start, data corruption risk, security issue
   - **high** — Feature broken but service runs
   - **medium** — Degraded behavior, workaround exists
   - **low** — Cosmetic, non-functional
3. **Propose fix** — Describe the root cause and proposed fix approach
4. **Discuss with user** — Present diagnosis and proposed approach; wait for user approval
5. **Delegate to sub-agent** — Send the fix task (see Sub-Agent Delegation below)
6. **Validate** — Apply the fix locally and re-run the specific failing check
7. **Create CR** — Push branch and create change request via the repository host API

### Phase 4: CI Pipeline & Merge Cycle

**Entry condition:** All CRs created in Phase 3.
**Exit condition:** All CRs merged (user-approved) and new images deployed.

1. **Monitor CI pipelines** — Poll pipeline status for each CR
2. **Fix CI failures** — If a pipeline fails, fetch job logs, diagnose, push a fix commit
3. **Notify user** — Report pipeline status and request merge approval
4. **Wait for merge** — User merges approved CRs
5. **Remove worktrees** — After each CR is created, remove its worktree:
   ```bash
   git -C <REPO_LOCAL_PATH> worktree remove \
     <WORKTREES_BASE>/fix/{check_id}-{short_description}/{repo_name}
   ```
6. **Tear down stack** — `docker compose --profile app down -v`
7. **Pull new images** — After merge, wait for registry build, then `docker compose --profile app pull`
8. **Begin next cycle** — Return to the appropriate starting phase: Phase 0 for PRD-driven skills (re-read PRDs, regenerate matrix, run full startup sequence), Phase 1 for static-matrix skills (run full startup sequence including infrastructure).

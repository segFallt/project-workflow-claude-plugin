## Error Handling

| Scenario | Recovery |
|----------|----------|
| Issue not found (404) | Verify issue IID and repo name; check if issue is in a different repo |
| Issue is closed | Confirm with user whether to reopen and implement, or create a new issue |
| Branch already exists on remote | Check if prior work exists on the branch; if stale, ask user before deleting |
| Worktree already exists locally | Reuse it (confirm branch matches) or run `git worktree prune` then recreate if stale |
| Worktree path has leftover symlinks | Remove stale symlinks before recreating: `rm <WORKTREES_BASE>/{branch_name}/{repo_name}` |
| Push fails (rejected) | Check if remote has diverged; fetch and rebase, or ask user before force-pushing |
| CI fails — lint | Read lint output, fix violations, push fix commit |
| CI fails — tests | Read test failure output, fix test or implementation, push fix commit |
| CI stuck (> 20 min) | Report the stuck job (name and duration) to user; ask whether to cancel and re-trigger |
| Cross-repo dependency not merged | Block downstream CR; notify user which upstream CR must merge first |
| Lint/test fail locally | Do not create CR; fix first, then push |
| Merge conflicts on branch | Rebase onto `main`; if conflicts are complex, ask user for guidance |
| CR closed unexpectedly during feedback loop | Notify user; confirm whether to reopen or abort. Proceed to Phase 7 cleanup. |
| CR has conflicts after review fix push | Notify user; offer to rebase onto `main`. If conflicts are complex, ask for guidance before proceeding. |
| Review feedback sub-agent disagrees with reviewer | Surface the disagreement to the user with both perspectives. Add to `skipped` — do not auto-resolve. |
| Discussion resolve API fails | Log the error and continue with remaining discussions. Report any unresolved threads to the user at the end of the round. |
| Reviewer references code outside the CR diff | Flag to user — the reviewer may want broader changes outside the original issue scope. Ask whether to expand scope or reply explaining the constraint. |
| Max review rounds exceeded | Present a summary (rounds completed, count of unresolved discussions, and links) and ask the user for direction: continue, take over manually, or stop. Proceed to Phase 7 if user stops. |

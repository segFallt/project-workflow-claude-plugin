# ralph-loop stop hook: Permission denied

When the ralph-loop plugin is installed but its stop hook script has not been made executable, Claude Code reports a non-fatal hook execution error on every session exit.

---

## Error

After installing the ralph-loop plugin, running Claude Code may produce the following output:

```
Hook execution error (non-fatal): /home/<user>/.claude/plugins/marketplaces/claude-plugins-official/plugins/ralph-loop/hooks/stop-hook.sh: Permission denied
```

The hook is registered as a `command`-type Stop hook pointing at `${CLAUDE_PLUGIN_ROOT}/hooks/stop-hook.sh`. Claude Code invokes the script directly, so the OS must be able to execute it.

---

## Root cause

`stop-hook.sh` is installed with `644` permissions (read/write for owner, read-only for group and others). Because the execute bit (`+x`) is absent, the OS refuses to run the file and returns a `Permission denied` error.

---

## Mitigation

Grant the execute bit to the stop hook script:

```bash
chmod +x ~/.claude/plugins/marketplaces/claude-plugins-official/plugins/ralph-loop/hooks/stop-hook.sh
```

Restart Claude Code after running the command. The `Permission denied` error will no longer appear.

---

## Note

This fix is temporary. The `644` permissions are restored whenever the plugin is reinstalled — for example, after running `claude plugin install` or after a plugin cache invalidation. Re-apply the `chmod +x` command each time the plugin is reinstalled.

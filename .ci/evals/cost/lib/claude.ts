/**
 * Process host for one headless `claude -p` stream-json session: builds the
 * isolated command line, spawns it, feeds stdout events to the pure driver,
 * and executes the driver's actions. Every event is appended to events.jsonl.
 */

import { appendFile, readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { newDriverState, step, userMessage, type Action, type DriverContext, type DriverState } from "./stream";

export const DEFAULT_DISABLED_PLUGINS = [
  "project-workflows@project-workflows-marketplace",
  "superpowers@claude-plugins-official",
  "feature-dev@claude-plugins-official",
  "ralph-loop@claude-plugins-official",
];

/** Installed plugins to disable; override with COST_EVAL_DISABLE_PLUGINS (comma list). */
export function disabledPlugins(): string[] {
  const env = process.env.COST_EVAL_DISABLE_PLUGINS;
  if (env === undefined) return DEFAULT_DISABLED_PLUGINS;
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isolationSettings(plugins = disabledPlugins()): string {
  return JSON.stringify({ enabledPlugins: Object.fromEntries(plugins.map((p) => [p, false])) });
}

export function buildClaudeArgs(opts: { pluginRoot: string; maxBudgetUsd: number; model?: string }): string[] {
  const args = [
    "claude", "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    // `manual` is the CLI's prompting mode (`claude --help` lists no `default`); passing it
    // explicitly keeps a user-level defaultMode from auto-approving tool calls.
    "--permission-mode", "manual",
    "--permission-prompt-tool", "stdio",
    "--max-budget-usd", String(opts.maxBudgetUsd),
    "--setting-sources", "user",
    "--settings", isolationSettings(),
    "--plugin-dir", opts.pluginRoot,
  ];
  if (opts.model) args.push("--model", opts.model);
  return args;
}

/** Default modes that approve some tool calls without a `can_use_tool` request reaching the host. */
const UNSAFE_DEFAULT_MODES = new Set(["bypassPermissions", "acceptEdits", "dontAsk", "auto"]);
/** Allow rules for command-running tools bypass the sandbox write guard. */
const COMMAND_TOOL_RULE = /^(Bash|Monitor)(\(|$)/;

/**
 * Reasons (empty when safe) a user settings.json would let tool calls skip the
 * stdio permission prompt, and with it the sandbox write guard.
 */
export function userSettingsRisk(settingsJson: string): string[] {
  let settings: any;
  try {
    settings = JSON.parse(settingsJson);
  } catch (err) {
    return [`not valid JSON (${(err as Error).message})`];
  }
  const perms = settings?.permissions ?? {};
  const risks: string[] = [];
  if (UNSAFE_DEFAULT_MODES.has(perms.defaultMode)) risks.push(`permissions.defaultMode is "${perms.defaultMode}"`);
  const allow: unknown[] = Array.isArray(perms.allow) ? perms.allow : [];
  for (const rule of allow) {
    if (typeof rule === "string" && COMMAND_TOOL_RULE.test(rule.trim())) risks.push(`permissions.allow contains "${rule}"`);
  }
  // Hook events that can return a permission decision would approve tool calls before the stdio prompt.
  for (const event of ["PreToolUse", "PermissionRequest"]) {
    const hooks = settings?.hooks?.[event];
    const configured = Array.isArray(hooks) ? hooks.length > 0 : Boolean(hooks && typeof hooks === "object" && Object.keys(hooks).length);
    if (configured) risks.push(`hooks.${event} is configured (a hook can approve tool calls before the stdio prompt)`);
  }
  return risks;
}

/** User settings path loaded by `--setting-sources user`; COST_EVAL_USER_SETTINGS overrides it. */
export function userSettingsPath(): string {
  return process.env.COST_EVAL_USER_SETTINGS ?? join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

/** Refuse write scenarios when user settings would auto-approve commands (absent file is fine). */
export async function assertUserSettingsSafe(path = userSettingsPath()): Promise<void> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  const risks = userSettingsRisk(text);
  if (risks.length > 0) {
    throw new Error(
      `${path} would let tool calls bypass the sandbox write guard; refusing write scenarios:\n  - ${risks.join("\n  - ")}`,
    );
  }
}

/**
 * Failure reason for a run the driver marked ok but whose process output is
 * suspect (unparsed stdout lines, non-zero exit), or null. Existing failures win.
 */
export function hostOutcomeFailure(
  status: DriverState["status"],
  exitCode: number | null,
  unparsedLines: number,
  endedMidTurn = false,
): string | null {
  if (status !== "ok") return null;
  if (unparsedLines > 0) return `${unparsedLines} unparsed stdout line(s); events may be missing`;
  // A mid-turn end stops the process on purpose, so its exit code is expected to be non-zero.
  if (exitCode !== 0 && !endedMidTurn) return `claude exited with code ${exitCode} after the end condition`;
  return null;
}

export function claudeVersion(): string {
  const res = Bun.spawnSync(["claude", "--version"], { stdout: "pipe", stderr: "pipe" });
  if (res.exitCode !== 0) throw new Error(`claude --version failed: ${res.stderr.toString().trim()}`);
  return res.stdout.toString().trim();
}

export interface HostOptions {
  args: string[];
  cwd: string;
  prompt: string;
  ctx: DriverContext;
  eventsPath: string;
  timeoutMs: number;
}

export interface HostResult {
  state: DriverState;
  exitCode: number | null;
  stderrTail: string;
  unparsedLines: number;
}

/** Run one session to completion and return the final driver state. */
export async function runClaude(opts: HostOptions): Promise<HostResult> {
  const state = newDriverState();
  const proc = Bun.spawn(opts.args, { cwd: opts.cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  let stdinOpen = true;
  let unparsedLines = 0;

  const log = (entry: unknown) => appendFile(opts.eventsPath, JSON.stringify(entry) + "\n");
  const send = async (msg: Record<string, unknown>) => {
    if (!stdinOpen) return;
    proc.stdin.write(JSON.stringify(msg) + "\n");
    await proc.stdin.flush();
    await log({ _sent: msg });
  };
  const closeStdin = async () => {
    if (!stdinOpen) return;
    stdinOpen = false;
    await proc.stdin.end();
  };
  const apply = async (actions: Action[]) => {
    for (const a of actions) {
      if (a.kind === "send") await send(a.message);
      else if (a.kind === "close") await closeStdin();
      else {
        await closeStdin();
        proc.kill();
      }
    }
  };

  const timer = setTimeout(() => {
    if (state.status === "running") {
      state.status = "failed";
      state.reason = `timeout after ${Math.round(opts.timeoutMs / 60000)} min`;
    }
    proc.kill();
  }, opts.timeoutMs);

  const stderrText = new Response(proc.stderr).text();
  await send(userMessage(opts.prompt));

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        unparsedLines += 1;
        await log({ _unparsed: line });
        continue;
      }
      await appendFile(opts.eventsPath, line + "\n");
      await apply(step(state, event, opts.ctx));
    }
  }

  const exitCode = await proc.exited;
  clearTimeout(timer);
  const stderrTail = (await stderrText).trim().split("\n").slice(-20).join("\n");
  if (state.status === "running") {
    state.status = "failed";
    state.reason = `claude exited (code ${exitCode}) before the end condition${stderrTail ? `: ${stderrTail.slice(-500)}` : ""}`;
  }
  if (!state.init && state.status === "ok") {
    state.status = "failed";
    state.reason = "no system/init event seen; plugin isolation unverified";
  }
  const outcome = hostOutcomeFailure(state.status, exitCode, unparsedLines, state.endedMidTurn);
  if (outcome) {
    state.status = "failed";
    state.reason = outcome;
  }
  return { state, exitCode, stderrTail, unparsedLines };
}

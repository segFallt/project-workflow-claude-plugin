/**
 * One measured scenario run: resolve and guard the cwd, render the scenario,
 * drive the claude session, then copy and attribute its transcripts and write
 * out/<run-id>/summary.json.
 */

import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { assertUserSettingsSafe, buildClaudeArgs, runClaude } from "./claude";
import { assertSandbox } from "./guard";
import { applyCaptures, renderScenario, type Scenario } from "./scenario";
import { turnCostDeltas, type ResultInfo } from "./stream";
import {
  copyTranscripts,
  firstMessageUsage,
  sessionDir,
  summariseSession,
  type MessageUsage,
  type SessionBreakdown,
} from "./transcript";

export interface RunOptions {
  scenario: Scenario;
  pluginRoot: string;
  pluginSha: string;
  sandboxDir: string;
  outRoot: string;
  vars: Record<string, string>;
  runIndex: number;
  claudeVersion: string;
  model?: string;
  maxBudgetUsd?: number;
  timeoutMs?: number;
}

export interface RunSummary {
  runId: string;
  scenario: string;
  runIndex: number;
  ok: boolean;
  reason?: string;
  startedAt: string;
  durationMs: number;
  cwd?: string;
  model?: string;
  claudeVersion: string;
  pluginRoot: string;
  pluginSha: string;
  plugins: { name: string; path: string }[];
  cacheNote: string;
  total_cost_usd: number;
  turnCosts: number[];
  results: ResultInfo[];
  toolCounts: Record<string, number>;
  tokens: SessionBreakdown | null;
  firstMessage?: MessageUsage;
  captured: Record<string, string>;
  sessionId?: string;
  /** claude process exit code; absent in results written before it was recorded. */
  exitCode?: number | null;
  /** stdout lines that were not JSON; absent in results written before it was recorded. */
  unparsedLines?: number;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.COST_EVAL_RUN_TIMEOUT_MIN ?? 60) * 60_000;

export async function loadContext(path: string): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`${path}: unreadable context (${(err as Error).message})`);
  }
}

export async function saveContext(path: string, ctx: Record<string, string>): Promise<void> {
  await writeFile(path, JSON.stringify(ctx, null, 2) + "\n");
}

export function gitSha(dir: string): string {
  const res = Bun.spawnSync(["git", "-C", dir, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
  if (res.exitCode !== 0) throw new Error(`git rev-parse failed in ${dir}: ${res.stderr.toString().trim()}`);
  const dirty = Bun.spawnSync(["git", "-C", dir, "status", "--porcelain"], { stdout: "pipe" }).stdout.toString().trim();
  return res.stdout.toString().trim() + (dirty ? "-dirty" : "");
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

async function resolveCwd(s: Scenario, sandboxDir: string): Promise<{ cwd: string; temp: boolean }> {
  if (s.cwd === "temp") {
    if (s.writes) throw new Error(`${s.id}: write scenarios never run in a temp cwd`);
    return { cwd: await realpath(await mkdtemp(join(tmpdir(), "cost-eval-"))), temp: true };
  }
  const cwd = await realpath(sandboxDir);
  if (s.writes) {
    await assertSandbox(cwd);
    await assertUserSettingsSafe();
  }
  return { cwd, temp: false };
}

/** Execute one run. Setup and attribution errors become a failed summary, never a silent pass. */
export async function runScenario(opts: RunOptions): Promise<RunSummary> {
  const s = opts.scenario;
  const runId = `${timestamp()}-${s.id}-${opts.runIndex}`;
  const outDir = join(opts.outRoot, runId);
  await mkdir(outDir, { recursive: true });
  const started = Date.now();
  const summary: RunSummary = {
    runId,
    scenario: s.id,
    runIndex: opts.runIndex,
    ok: false,
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    claudeVersion: opts.claudeVersion,
    pluginRoot: opts.pluginRoot,
    pluginSha: opts.pluginSha,
    plugins: [],
    cacheNote: opts.runIndex === 1 ? "first run (cold prompt cache likely)" : "repeat run (warm prompt cache possible)",
    total_cost_usd: 0,
    turnCosts: [],
    results: [],
    toolCounts: {},
    tokens: null,
    captured: {},
  };

  let tempCwd: string | undefined;
  try {
    const scenario = renderScenario(s, opts.vars);
    const { cwd, temp } = await resolveCwd(scenario, opts.sandboxDir);
    if (temp) tempCwd = cwd;
    summary.cwd = cwd;
    const pluginRoot = await realpath(opts.pluginRoot);
    const host = await runClaude({
      args: buildClaudeArgs({
        pluginRoot,
        maxBudgetUsd: opts.maxBudgetUsd ?? scenario.maxBudgetUsd,
        model: opts.model ?? scenario.model,
      }),
      cwd,
      prompt: scenario.prompt,
      ctx: { scenario, pluginRoot },
      eventsPath: join(outDir, "events.jsonl"),
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    const st = host.state;
    Object.assign(summary, {
      ok: st.status === "ok",
      reason: st.reason,
      model: st.init?.model,
      plugins: st.init?.plugins ?? [],
      results: st.results,
      toolCounts: st.toolCounts,
      sessionId: st.sessionId,
      exitCode: host.exitCode,
      unparsedLines: host.unparsedLines,
      total_cost_usd: st.results.at(-1)?.total_cost_usd ?? 0,
      turnCosts: turnCostDeltas(st.results.map((r) => r.total_cost_usd)),
    });

    if (st.sessionId) {
      const dir = sessionDir(cwd);
      await copyTranscripts(dir, st.sessionId, join(outDir, "transcripts"));
      summary.tokens = await summariseSession(dir, st.sessionId);
      summary.firstMessage = await firstMessageUsage(dir, st.sessionId);
    } else if (summary.ok) {
      throw new Error("no session_id observed; cannot attribute tokens");
    }

    const { values, missing } = applyCaptures(scenario.capture, st.allText);
    summary.captured = values;
    if (summary.ok && missing.length > 0) {
      summary.ok = false;
      summary.reason = `required capture not found: ${missing.join(", ")}`;
    }
  } catch (err) {
    summary.ok = false;
    const msg = (err as Error).message;
    summary.reason = summary.reason ? `${summary.reason}; then: ${msg}` : msg;
  } finally {
    if (tempCwd) await rm(tempCwd, { recursive: true, force: true });
    summary.durationMs = Date.now() - started;
    await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  }
  return summary;
}

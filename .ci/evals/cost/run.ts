#!/usr/bin/env bun
/**
 * Per-skill token/cost baseline runner (#68). Spends real money — see README.md.
 *
 * Usage:
 *   bun run.ts probe                                   # one isolated haiku call, prints init/plugins/result
 *   bun run.ts seed [--work-item "#73"]                # clone + commit sandbox payload (no push)
 *   bun run.ts listing-ab [--runs 3] [--model haiku]   # skill-listing A/B
 *   bun run.ts baseline [--scenario <id>]... [--runs 3] [--var NAME=value]... [--ci-delay <s>]
 *   bun run.ts report [results/baseline-<date>.json]   # markdown table
 *   bun run.ts curate <curation.json>                  # final baseline from listed out/ runs
 *
 * Exit codes: 0 all runs ok, 1 one or more runs failed, 2 fatal error.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "fs/promises";
import { homedir, tmpdir } from "os";
import { join, resolve } from "path";
import { claudeVersion } from "./lib/claude";
import { applyVariantB, copyPluginTree, listingStats, pluginDetails } from "./lib/listing";
import { aggregate, renderMarkdown, stats, writeResults } from "./lib/report";
import { gitSha, loadContext, runScenario, saveContext, type RunSummary } from "./lib/runner";
import { loadScenario, type Scenario } from "./lib/scenario";
import { loadCredentials, SandboxGitLab, withCiDelay } from "./lib/gitlab";
import { seedSandbox } from "./lib/seed";

const HERE = import.meta.dir;
const SCENARIOS_DIR = join(HERE, "scenarios");
const OUT_DIR = join(HERE, "out");
const RESULTS_DIR = join(HERE, "results");
const CONTEXT_PATH = join(OUT_DIR, "context.json");
const BASELINE_ORDER = ["work-item-create", "work-item-refine", "development", "code-review", "gitlab-api-lookup"];

const PLUGIN_DIR = resolve(process.env.COST_EVAL_PLUGIN_DIR ?? join(HERE, "..", "..", ".."));
const SANDBOX_DIR = process.env.COST_EVAL_SANDBOX_DIR ?? join(homedir(), "cost-eval", "agent-sandbox");
const MAX_TOTAL_USD = Number(process.env.COST_EVAL_MAX_TOTAL_USD ?? 60);
const ENV_SOURCE = process.env.COST_EVAL_ENV_SOURCE ?? "/workspace/.claude/project-config/.env";

interface Flags {
  runs: number;
  model?: string;
  scenarios: string[];
  vars: Record<string, string>;
  positional: string[];
  /** Seconds the sandbox CI job sleeps (sets the CI_DELAY project variable for the command). */
  ciDelay?: number;
  workItem?: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { runs: 3, scenarios: [], vars: {}, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--runs") {
      flags.runs = Number(value());
      if (!Number.isInteger(flags.runs) || flags.runs < 1) throw new Error("--runs must be a positive integer");
    } else if (arg === "--model") flags.model = value();
    else if (arg === "--scenario") flags.scenarios.push(value());
    else if (arg === "--var") {
      const m = value().match(/^([A-Z][A-Z0-9_]*)=(.+)$/);
      if (!m) throw new Error("--var expects NAME=value");
      flags.vars[m[1]] = m[2];
    } else if (arg === "--ci-delay") {
      flags.ciDelay = Number(value());
      if (!Number.isInteger(flags.ciDelay) || flags.ciDelay < 0) throw new Error("--ci-delay must be a non-negative integer");
    } else if (arg === "--work-item") {
      flags.workItem = value();
      if (!/^#\d+$/.test(flags.workItem)) throw new Error('--work-item expects "#<iid>"');
    } else if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
    else flags.positional.push(arg);
  }
  return flags;
}

/** Tracks cumulative spend against COST_EVAL_MAX_TOTAL_USD. */
class Budget {
  spent = 0;
  constructor(readonly cap: number) {}
  allows(next: number): boolean {
    return this.spent + next <= this.cap;
  }
  record(run: RunSummary): void {
    this.spent += run.total_cost_usd;
  }
}

function printRun(r: RunSummary): void {
  const status = r.ok ? "OK" : `FAILED (${r.reason})`;
  process.stdout.write(`[${r.runId}] ${status} cost=$${r.total_cost_usd.toFixed(4)}\n`);
}

function commonRunFields() {
  return { pluginSha: gitSha(PLUGIN_DIR), claudeVersion: claudeVersion(), sandboxDir: SANDBOX_DIR, outRoot: OUT_DIR };
}

async function cmdProbe(): Promise<number> {
  await mkdir(OUT_DIR, { recursive: true });
  const r = await runScenario({
    ...commonRunFields(),
    scenario: await loadScenario(join(SCENARIOS_DIR, "listing-probe.json")),
    pluginRoot: PLUGIN_DIR,
    vars: {},
    runIndex: 1,
    model: "haiku",
    maxBudgetUsd: 0.1,
  });
  process.stdout.write(
    JSON.stringify(
      { ok: r.ok, reason: r.reason, model: r.model, claudeVersion: r.claudeVersion, plugins: r.plugins, cost: r.total_cost_usd, tokens: r.tokens?.total },
      null,
      2,
    ) + "\n",
  );
  return r.ok ? 0 : 1;
}

async function cmdSeed(flags: Flags): Promise<number> {
  const notes = await seedSandbox({
    sandboxDir: SANDBOX_DIR,
    payloadDir: join(HERE, "sandbox", "payload"),
    envSource: ENV_SOURCE,
    workItem: flags.workItem,
  });
  process.stdout.write(notes.join("\n") + "\n");
  return 0;
}

/** `baseline`, wrapped so the runner (not the model) sets CI_DELAY on the sandbox and always removes it. */
async function cmdBaseline(flags: Flags): Promise<number> {
  if (flags.ciDelay === undefined) return runBaseline(flags);
  const client = new SandboxGitLab(await loadCredentials(ENV_SOURCE), fetch);
  process.stdout.write(`Setting ${client.project} CI_DELAY=${flags.ciDelay}s for this command\n`);
  return withCiDelay(client, flags.ciDelay, () => runBaseline(flags));
}

async function runBaseline(flags: Flags): Promise<number> {
  await mkdir(OUT_DIR, { recursive: true });
  const ids = flags.scenarios.length ? flags.scenarios : BASELINE_ORDER;
  const scenarios: Scenario[] = [];
  for (const id of ids) scenarios.push(await loadScenario(join(SCENARIOS_DIR, `${id}.json`)));

  const context = { ...(await loadContext(CONTEXT_PATH)), ...flags.vars };
  await saveContext(CONTEXT_PATH, context);
  const common = commonRunFields();
  const budget = new Budget(MAX_TOTAL_USD);
  const runs: RunSummary[] = [];
  let stoppedReason: string | undefined;

  outer: for (const scenario of scenarios) {
    for (let n = 1; n <= flags.runs; n++) {
      if (!budget.allows(scenario.maxBudgetUsd)) {
        stoppedReason = `global cap $${MAX_TOTAL_USD} would be exceeded (spent $${budget.spent.toFixed(2)} + ${scenario.id} cap $${scenario.maxBudgetUsd})`;
        break outer;
      }
      const r = await runScenario({ ...common, scenario, pluginRoot: PLUGIN_DIR, vars: context, runIndex: n, model: flags.model });
      budget.record(r);
      runs.push(r);
      printRun(r);
      if (Object.keys(r.captured).length) {
        Object.assign(context, r.captured);
        await saveContext(CONTEXT_PATH, context);
      }
    }
  }
  if (stoppedReason) process.stderr.write(`Stopped: ${stoppedReason}\n`);

  const aggregates = aggregate(runs);
  const path = await writeResults(RESULTS_DIR, "baseline", {
    kind: "baseline",
    createdAt: new Date().toISOString(),
    claudeVersion: common.claudeVersion,
    pluginSha: common.pluginSha,
    totalSpentUsd: budget.spent,
    stoppedReason,
    aggregates,
    runs,
  });
  process.stdout.write(`\n${renderMarkdown(aggregates)}\n\nWrote ${path}\n`);
  return runs.every((r) => r.ok) && !stoppedReason ? 0 : 1;
}

function contextTokens(r: RunSummary): number | null {
  const m = r.firstMessage;
  return m ? m.input_tokens + m.cache_creation_input_tokens + m.cache_read_input_tokens : null;
}

async function cmdListingAb(flags: Flags): Promise<number> {
  await mkdir(OUT_DIR, { recursive: true });
  const scenario = await loadScenario(join(SCENARIOS_DIR, "listing-probe.json"));
  const common = commonRunFields();
  const root = await mkdtemp(join(tmpdir(), "cost-eval-listing-"));
  const budget = new Budget(MAX_TOTAL_USD);
  const runs: (RunSummary & { variant: string; contextTokens: number | null })[] = [];
  let stoppedReason: string | undefined;
  try {
    const dirs = { A: join(root, "A", "project-workflows"), B: join(root, "B", "project-workflows") };
    await copyPluginTree(PLUGIN_DIR, dirs.A);
    await copyPluginTree(PLUGIN_DIR, dirs.B);
    await applyVariantB(dirs.B);
    const staticStats = { A: await listingStats(dirs.A), B: await listingStats(dirs.B) };
    const details = { A: pluginDetails(dirs.A), B: pluginDetails(dirs.B) };

    outer: for (let n = 1; n <= flags.runs; n++) {
      for (const variant of ["A", "B"] as const) {
        if (!budget.allows(scenario.maxBudgetUsd)) {
          stoppedReason = `global cap $${MAX_TOTAL_USD} would be exceeded (spent $${budget.spent.toFixed(2)})`;
          break outer;
        }
        const r = await runScenario({
          ...common,
          scenario: { ...scenario, id: `listing-${variant}` },
          pluginRoot: dirs[variant],
          vars: {},
          runIndex: n,
          model: flags.model ?? scenario.model ?? "haiku",
        });
        budget.record(r);
        printRun(r);
        runs.push({ ...r, variant, contextTokens: contextTokens(r) });
      }
    }

    const medianOf = (v: string) =>
      stats(runs.filter((r) => r.variant === v && r.ok && r.contextTokens !== null).map((r) => r.contextTokens!));
    const a = medianOf("A");
    const b = medianOf("B");
    const summary = {
      A: a,
      B: b,
      deltaMedianContextTokens: a && b ? b.median - a.median : null,
      deltaListingChars: staticStats.B.listingChars - staticStats.A.listingChars,
    };
    const path = await writeResults(RESULTS_DIR, "listing-ab", {
      kind: "listing-ab",
      createdAt: new Date().toISOString(),
      claudeVersion: common.claudeVersion,
      pluginSha: common.pluginSha,
      model: flags.model ?? scenario.model ?? "haiku",
      totalSpentUsd: budget.spent,
      stoppedReason,
      staticStats,
      pluginDetails: details,
      summary,
      runs,
    });
    process.stdout.write(`${JSON.stringify({ staticStats, summary }, null, 2)}\nWrote ${path}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  if (stoppedReason) process.stderr.write(`Stopped: ${stoppedReason}\n`);
  return runs.every((r) => r.ok) && !stoppedReason ? 0 : 1;
}

/** Most recently modified results/baseline-*.json (ties broken by name). */
async function latestResults(): Promise<string> {
  const names = (await readdir(RESULTS_DIR)).filter((f) => /^baseline-.*\.json$/.test(f));
  if (!names.length) throw new Error(`no baseline results in ${RESULTS_DIR}`);
  const files = await Promise.all(
    names.map(async (name) => ({ name, mtimeMs: (await stat(join(RESULTS_DIR, name))).mtimeMs })),
  );
  files.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  return join(RESULTS_DIR, files[0].name);
}

async function cmdReport(flags: Flags): Promise<number> {
  const path = flags.positional[0] ?? (await latestResults());
  const data = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(data.runs)) throw new Error(`${path}: no runs[] array`);
  process.stdout.write(`# Baseline (${path})\n\n${renderMarkdown(aggregate(data.runs))}\n`);
  return 0;
}

interface Curation {
  date: string;
  include: string[];
  exclude: { runId: string; reason: string }[];
}

/** Build the final baseline from hand-validated runs; out/ is gitignored, so the summaries are embedded. */
async function cmdCurate(flags: Flags): Promise<number> {
  const path = flags.positional[0];
  if (!path) throw new Error("curate needs a curation file, e.g. curation-<date>.json");
  const curation = JSON.parse(await readFile(path, "utf8")) as Curation;
  if (!Array.isArray(curation.include) || !Array.isArray(curation.exclude)) {
    throw new Error(`${path}: expected include[] and exclude[]`);
  }
  const runs = await Promise.all(
    curation.include.map(async (id) => JSON.parse(await readFile(join(OUT_DIR, id, "summary.json"), "utf8"))),
  );
  const notOk = runs.filter((r) => !r.ok).map((r) => r.runId);
  if (notOk.length) throw new Error(`included runs did not pass: ${notOk.join(", ")}`);
  const aggregates = aggregate(runs);
  const out = await writeResults(RESULTS_DIR, "baseline-final", { curation, aggregates, runs });
  process.stdout.write(`${renderMarkdown(aggregates)}\nWrote ${out}\n`);
  return 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (flags.ciDelay !== undefined && command !== "baseline") throw new Error("--ci-delay applies to baseline only");
  if (flags.workItem !== undefined && command !== "seed") throw new Error("--work-item applies to seed only");
  switch (command) {
    case "probe":
      return cmdProbe();
    case "seed":
      return cmdSeed(flags);
    case "baseline":
      return cmdBaseline(flags);
    case "listing-ab":
      return cmdListingAb(flags);
    case "curate":
      return cmdCurate(flags);
    case "report":
      return cmdReport(flags);
    default:
      throw new Error(`unknown command ${JSON.stringify(command ?? "")}; expected probe|seed|listing-ab|baseline|report|curate`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`Fatal: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
  });

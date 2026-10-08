/**
 * Aggregation and reporting: per-scenario median/min/max over run summaries,
 * the results/<kind>-<date>.json writer, and the markdown table renderer.
 */

import { access, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { RunSummary } from "./runner";
import type { TokenTotals } from "./transcript";

export interface Stats {
  median: number;
  min: number;
  max: number;
}

export function stats(values: number[]): Stats | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { median, min: sorted[0], max: sorted[sorted.length - 1] };
}

export interface ScenarioAggregate {
  scenario: string;
  runs: number;
  ok: number;
  failed: number;
  costUsd: Stats | null;
  tokens: Record<keyof TokenTotals, Stats | null> | null;
  subagentTokens: Stats | null;
  /** Sub-agent (dispatch description, else agent type) → every model it ran on, across successful runs. */
  subagentModels: Record<string, string[]>;
}

const FIELDS: (keyof TokenTotals)[] = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
];

function totalOf(t: TokenTotals): number {
  return FIELDS.reduce((acc, f) => acc + t[f], 0);
}

function modelsBySubagent(runs: RunSummary[]): Record<string, string[]> {
  const byType = new Map<string, Set<string>>();
  for (const s of runs.flatMap((r) => r.tokens?.subagents ?? [])) {
    const type = s.description ?? s.agentType ?? "unknown";
    const set = byType.get(type) ?? new Set<string>();
    s.models.forEach((m) => set.add(m));
    byType.set(type, set);
  }
  return Object.fromEntries([...byType].sort(([a], [b]) => a.localeCompare(b)).map(([t, m]) => [t, [...m].sort()]));
}

/** Aggregate successful runs per scenario (failed runs are counted, not measured). */
export function aggregate(runs: RunSummary[]): ScenarioAggregate[] {
  const ids = [...new Set(runs.map((r) => r.scenario))];
  return ids.map((scenario) => {
    const all = runs.filter((r) => r.scenario === scenario);
    const ok = all.filter((r) => r.ok);
    const withTokens = ok.filter((r) => r.tokens);
    const tokens = withTokens.length
      ? (Object.fromEntries(FIELDS.map((f) => [f, stats(withTokens.map((r) => r.tokens!.total[f]))])) as Record<
          keyof TokenTotals,
          Stats | null
        >)
      : null;
    return {
      scenario,
      runs: all.length,
      ok: ok.length,
      failed: all.length - ok.length,
      costUsd: stats(ok.map((r) => r.total_cost_usd)),
      tokens,
      subagentTokens: stats(
        withTokens.map((r) => r.tokens!.subagents.reduce((acc, s) => acc + totalOf(s.tokens), 0)),
      ),
      subagentModels: modelsBySubagent(withTokens),
    };
  });
}

/** Write results/<kind>-<YYYY-MM-DD>[-n].json without overwriting earlier files. */
export async function writeResults(resultsDir: string, kind: string, payload: unknown): Promise<string> {
  await mkdir(resultsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  for (let n = 1; ; n++) {
    const path = join(resultsDir, `${kind}-${date}${n === 1 ? "" : `-${n}`}.json`);
    const exists = await access(path).then(
      () => true,
      () => false,
    );
    if (!exists) {
      await writeFile(path, JSON.stringify(payload, null, 2) + "\n");
      return path;
    }
  }
}

function money(s: Stats | null): string {
  return s ? `$${s.median.toFixed(4)} ($${s.min.toFixed(4)}–$${s.max.toFixed(4)})` : "–";
}

function models(byType: Record<string, string[]>): string {
  const entries = Object.entries(byType);
  return entries.length ? entries.map(([t, m]) => `${t}: ${m.join(", ")}`).join("; ") : "–";
}

function count(s: Stats | null | undefined): string {
  return s ? Math.round(s.median).toLocaleString("en-US") : "–";
}

/** Markdown table: one row per scenario; token columns are medians. */
export function renderMarkdown(aggregates: ScenarioAggregate[]): string {
  const header =
    "| Scenario | OK / failed | Cost median (min–max) | Input | Output | Cache write | Cache read | Sub-agent tokens | Sub-agent models |\n" +
    "|---|---|---|---|---|---|---|---|---|";
  const rows = aggregates.map(
    (a) =>
      `| ${a.scenario} | ${a.ok} / ${a.failed} | ${money(a.costUsd)} | ${count(a.tokens?.input_tokens)} | ` +
      `${count(a.tokens?.output_tokens)} | ${count(a.tokens?.cache_creation_input_tokens)} | ` +
      `${count(a.tokens?.cache_read_input_tokens)} | ${count(a.subagentTokens)} | ${models(a.subagentModels)} |`,
  );
  return [header, ...rows].join("\n");
}

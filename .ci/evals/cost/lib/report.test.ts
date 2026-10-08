import { describe, expect, test } from "bun:test";
import { aggregate, renderMarkdown, stats } from "./report";
import type { RunSummary } from "./runner";

const tokens = (input: number, sub: number) => ({
  coordinator: { file: "c", models: [], messages: 1, tokens: { input_tokens: input, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
  subagents: [{ file: "s", models: [], messages: 1, tokens: { input_tokens: sub, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }],
  total: { input_tokens: input + sub, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});

const run = (ok: boolean, cost: number, input: number): RunSummary =>
  ({ scenario: "s1", ok, total_cost_usd: cost, tokens: ok ? tokens(input, 10) : null }) as unknown as RunSummary;

describe("stats", () => {
  test("median of odd and even lengths", () => {
    expect(stats([3, 1, 2])).toEqual({ median: 2, min: 1, max: 3 });
    expect(stats([4, 1, 2, 3])).toEqual({ median: 2.5, min: 1, max: 4 });
    expect(stats([])).toBeNull();
  });
});

describe("aggregate + renderMarkdown", () => {
  test("measures only successful runs and counts failures", () => {
    const [a] = aggregate([run(true, 1, 100), run(true, 3, 300), run(false, 9, 0)]);
    expect(a.ok).toBe(2);
    expect(a.failed).toBe(1);
    expect(a.costUsd).toEqual({ median: 2, min: 1, max: 3 });
    expect(a.tokens?.input_tokens?.median).toBe(210);
    expect(a.subagentTokens?.median).toBe(10);
    const md = renderMarkdown([a]);
    expect(md).toContain("| s1 | 2 / 1 | $2.0000 ($1.0000–$3.0000) | 210 |");
  });
});

describe("sub-agent models", () => {
  const withSubs = (subagents: { agentType?: string; description?: string; models: string[] }[]): RunSummary =>
    ({
      scenario: "s2",
      ok: true,
      total_cost_usd: 1,
      tokens: { ...tokens(1, 1), subagents: subagents.map((s) => ({ ...tokens(1, 1).subagents[0], ...s })) },
    }) as unknown as RunSummary;

  test("maps each sub-agent (description, else agent type) to the models it ran on across runs", () => {
    const [a] = aggregate([
      withSubs([{ agentType: "general-purpose", description: "Explore code", models: ["claude-sonnet"] }, { agentType: "general-purpose", models: ["claude-opus"] }, { models: ["claude-opus"] }]),
      withSubs([{ agentType: "general-purpose", description: "Explore code", models: ["claude-haiku"] }]),
    ]);
    expect(a.subagentModels).toEqual({ "Explore code": ["claude-haiku", "claude-sonnet"], "general-purpose": ["claude-opus"], unknown: ["claude-opus"] });
    expect(renderMarkdown([a])).toContain("| Explore code: claude-haiku, claude-sonnet; general-purpose: claude-opus; unknown: claude-opus |");
  });

  test("renders a dash when no sub-agent ran", () => {
    const [a] = aggregate([withSubs([])]);
    expect(a.subagentModels).toEqual({});
    expect(renderMarkdown([a])).toMatch(/\| – \|$/);
  });
});

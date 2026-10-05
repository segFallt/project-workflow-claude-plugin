import { describe, expect, test } from "bun:test";
import { join } from "path";
import { parseTranscript, sanitisePath, sessionDir, summariseSession } from "./transcript";

const FIXTURES = join(import.meta.dir, "__fixtures__", "session");

describe("sanitisePath", () => {
  test("replaces every non-alphanumeric char with '-'", () => {
    expect(sanitisePath("/tmp/claude-1000/-workspace/x/probe/cwd")).toBe("-tmp-claude-1000--workspace-x-probe-cwd");
  });
  test("sessionDir joins config dir, projects, sanitised cwd", () => {
    expect(sessionDir("/home/u/cost-eval/agent-sandbox", "/cfg")).toBe("/cfg/projects/-home-u-cost-eval-agent-sandbox");
  });
});

describe("parseTranscript", () => {
  const line = (obj: unknown) => JSON.stringify(obj);
  const usage = { input_tokens: 1, output_tokens: 2, cache_creation_input_tokens: 3, cache_read_input_tokens: 4 };

  test("keeps the last line per message.id and ignores nested sub-objects", () => {
    const text = [
      line({ type: "assistant", message: { id: "m1", usage: { ...usage, output_tokens: 5, iterations: [{ input_tokens: 99 }] } } }),
      line({ type: "assistant", message: { id: "m1", usage: { ...usage, output_tokens: 286, cache_creation: { x: 9 } } } }),
    ].join("\n");
    const msgs = parseTranscript(text, "t.jsonl");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].output_tokens).toBe(286);
    expect(msgs[0].input_tokens).toBe(1);
  });

  test("falls back to requestId and skips non-assistant lines", () => {
    const text = [line({ type: "user", message: {} }), line({ type: "assistant", requestId: "r9", message: { usage } })].join("\n");
    expect(parseTranscript(text, "t.jsonl").map((m) => m.id)).toEqual(["r9"]);
  });

  test("throws with file:line when id and requestId are missing", () => {
    const text = `${line({ type: "user" })}\n${line({ type: "assistant", message: { usage } })}`;
    expect(() => parseTranscript(text, "t.jsonl")).toThrow("t.jsonl:2");
  });

  test("throws when a usage field is missing", () => {
    const text = line({ type: "assistant", message: { id: "m", usage: { input_tokens: 1, output_tokens: 2 } } });
    expect(() => parseTranscript(text, "t.jsonl")).toThrow("cache_creation_input_tokens");
  });
});

describe("summariseSession", () => {
  test("groups coordinator vs sub-agents with meta and model", async () => {
    const s = await summariseSession(FIXTURES, "sess-0001");
    expect(s.coordinator.messages).toBe(2);
    expect(s.coordinator.tokens).toEqual({
      input_tokens: 14,
      output_tokens: 306,
      cache_creation_input_tokens: 1050,
      cache_read_input_tokens: 5000,
    });
    expect(s.coordinator.models).toEqual(["claude-opus-test"]);
    expect(s.subagents).toHaveLength(1);
    const sub = s.subagents[0];
    expect(sub.agentType).toBe("quality-reviewer");
    expect(sub.description).toBe("Review draft issue");
    expect(sub.models).toEqual(["claude-haiku-test"]);
    expect(sub.tokens).toEqual({ input_tokens: 8, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 100 });
    expect(s.total.output_tokens).toBe(311);
  });
});

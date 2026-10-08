import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import type { Scenario } from "./scenario";
import { checkInit, newDriverState, step, turnCostDeltas, type Action } from "./stream";

const ROOT = "/fake/plugin";

function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    id: "t",
    description: "t",
    writes: false,
    cwd: "temp",
    prompt: "hi",
    followUps: [{ match: "(?i)question", reply: "Proceed." }],
    askAnswers: [{ question: "label", answer: "$first" }],
    endWhen: { assistantMatches: "/-/issues/\\d+" },
    maxBudgetUsd: 1,
    ...over,
  };
}

const init = { type: "system", subtype: "init", session_id: "s", plugins: [{ name: "project-workflows", path: ROOT }] };
const assistant = (text: string) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });
const result = (total: number, over: Record<string, unknown> = {}) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  total_cost_usd: total,
  session_id: "s",
  ...over,
});

function drive(events: unknown[], sc = scenario()) {
  const state = newDriverState();
  const actions: Action[] = [];
  for (const e of events) actions.push(...step(state, e, { scenario: sc, pluginRoot: ROOT }));
  return { state, actions };
}

describe("turnCostDeltas", () => {
  test("derives per-turn cost from cumulative totals", () => {
    expect(turnCostDeltas([0.1, 0.25, 0.3])).toEqual([0.1, 0.15, 0.05]);
    expect(turnCostDeltas([])).toEqual([]);
  });
});

describe("checkInit", () => {
  test("accepts exactly one project-workflows at the plugin root", () => {
    expect(checkInit([{ name: "project-workflows", path: ROOT }, { name: "other", path: "/x" }], ROOT)).toBeNull();
  });
  test("rejects a wrong path, a duplicate, or absence", () => {
    expect(checkInit([{ name: "project-workflows", path: "/installed" }], ROOT)).toContain("isolation");
    expect(
      checkInit([{ name: "project-workflows", path: ROOT }, { name: "project-workflows", path: "/installed" }], ROOT),
    ).toContain("isolation");
    expect(checkInit([], ROOT)).toContain("isolation");
  });
  test("driver aborts on a failed init check", () => {
    const { state, actions } = drive([{ ...init, plugins: [] }]);
    expect(state.status).toBe("failed");
    expect(actions).toEqual([{ kind: "abort" }]);
  });
  test("driver aborts on a permission request before init", () => {
    const { state, actions } = drive([
      { type: "control_request", request_id: "r", request: { subtype: "can_use_tool", tool_name: "Bash", input: {} } },
    ]);
    expect(state.status).toBe("failed");
    expect(actions).toEqual([{ kind: "abort" }]);
  });
});

describe("recorded stream fixture", () => {
  test("answers follow-up, allows tools, answers AskUserQuestion, ends on issue URL", () => {
    const events = readFileSync(join(import.meta.dir, "__fixtures__", "stream-work-item.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const { state, actions } = drive(events);
    expect(state.status).toBe("ok");
    expect(state.turns).toBe(2);
    expect(state.toolCounts).toEqual({ Bash: 1, AskUserQuestion: 1 });
    expect(state.results.map((r) => r.total_cost_usd)).toEqual([0.12, 0.5]);
    expect(actions[0]).toEqual({ kind: "send", message: { type: "user", message: { role: "user", content: "Proceed." } } });
    const bash = actions[1] as any;
    expect(bash.message.response).toEqual({
      subtype: "success",
      request_id: "r1",
      response: { behavior: "allow", updatedInput: { command: "ls" } },
    });
    const ask = actions[2] as any;
    expect(ask.message.response.response.updatedInput.answers).toEqual({ "Which label?": "type::feature" });
    expect(ask.message.response.response.updatedInput.questions).toHaveLength(1);
    expect(actions[3]).toEqual({ kind: "close" });
  });
});

describe("driver failures", () => {
  test("unscripted pause fails and closes", () => {
    const { state, actions } = drive([init, assistant("What should I name it"), result(0.1)]);
    expect(state.status).toBe("failed");
    expect(state.reason).toContain("unscripted pause: What should I name it");
    expect(actions).toEqual([{ kind: "close" }]);
  });

  test("single-use follow-up is not reused", () => {
    const { state } = drive([init, assistant("question 1"), result(0.1), assistant("question 2"), result(0.2)]);
    expect(state.status).toBe("failed");
    expect(state.reason).toContain("unscripted pause");
  });

  test("repeat follow-up can be reused", () => {
    const sc = scenario({ followUps: [{ match: "question", reply: "go", repeat: true }] });
    const { state, actions } = drive([init, assistant("question 1"), result(0.1), assistant("question 2"), result(0.2)], sc);
    expect(state.status).toBe("running");
    expect(actions.filter((a) => a.kind === "send")).toHaveLength(2);
  });

  test("unscripted AskUserQuestion denies and aborts", () => {
    const { state, actions } = drive([
      init,
      {
        type: "control_request",
        request_id: "r",
        request: { subtype: "can_use_tool", tool_name: "AskUserQuestion", input: { questions: [{ question: "Milestone?" }] } },
      },
    ]);
    expect(state.status).toBe("failed");
    expect(state.reason).toBe("unscripted question: Milestone?");
    expect((actions[0] as any).message.response.response.behavior).toBe("deny");
    expect(actions[1]).toEqual({ kind: "abort" });
  });

  test("error result fails the run", () => {
    const { state } = drive([init, result(1.0, { subtype: "error_max_budget_usd", is_error: true })]);
    expect(state.status).toBe("failed");
    expect(state.reason).toContain("error_max_budget_usd");
  });

  test("afterFollowUp ends after the turn answering that reply", () => {
    const sc = scenario({
      followUps: [{ match: "ready", reply: "Proceed." }, { match: "[\\s\\S]*", reply: "Continue.", repeat: true }],
      endWhen: { afterFollowUp: 0 },
    });
    const { state, actions } = drive(
      [init, assistant("working"), result(0.01), assistant("ready to merge"), result(0.02), assistant("anything"), result(0.03)],
      sc,
    );
    expect(state.status).toBe("ok");
    expect(actions.map((a) => (a.kind === "send" ? (a.message as any).message.content : a.kind))).toEqual([
      "Continue.",
      "Proceed.",
      "close",
    ]);
  });

  test("maxTurns ends successfully", () => {
    const { state, actions } = drive([init, assistant("anything"), result(0.01)], scenario({ endWhen: { maxTurns: 1 } }));
    expect(state.status).toBe("ok");
    expect(actions).toEqual([{ kind: "close" }]);
  });
});

describe("sandbox write guard", () => {
  const FOREIGN = "curl -X POST https://h/api/v4/projects/36/merge_requests/1/notes -d body=x";
  const request = (tool: string, command: string) => ({
    type: "control_request",
    request_id: "r",
    request: { subtype: "can_use_tool", tool_name: tool, input: { command } },
  });
  const writes = scenario({ writes: true, cwd: "sandbox" });

  test.each(["Bash", "Monitor"])("denies and aborts a foreign write via %s", (tool) => {
    const { state, actions } = drive([init, request(tool, FOREIGN)], writes);
    expect(state.status).toBe("failed");
    expect(state.reason).toContain("sandbox guard");
    expect(actions).toHaveLength(2);
    expect(actions[0].kind).toBe("send");
    const msg = (actions[0] as any).message;
    expect(msg.type).toBe("control_response");
    expect(msg.response.response.behavior).toBe("deny");
    expect(actions[1]).toEqual({ kind: "abort" });
  });
  test("allows the same command in a read-only scenario", () => {
    const { state, actions } = drive([init, request("Bash", FOREIGN)]);
    expect(state.status).toBe("running");
    expect((actions[0] as any).message.response.response.behavior).toBe("allow");
  });
  test("allows a sandbox write in a write scenario", () => {
    const cmd = "curl -X POST https://h/api/v4/projects/49/merge_requests/1/notes -d body=x";
    const { state, actions } = drive([init, request("Monitor", cmd)], writes);
    expect(state.status).toBe("running");
    expect((actions[0] as any).message.response.response).toEqual({ behavior: "allow", updatedInput: { command: cmd } });
  });
});

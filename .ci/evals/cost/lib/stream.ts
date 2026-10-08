/**
 * Pure stream-json driver. `step()` consumes one stdout event from
 * `claude -p --output-format stream-json` and returns the actions the host
 * must perform (stdin writes, close, abort). No I/O happens here, so the
 * whole conversation policy is unit-testable without spawning a process.
 */

import { resolve } from "path";
import { foreignWriteReason } from "./guard";
import {
  answerQuestions,
  endConditionMet,
  pickFollowUp,
  toolEndConditionMet,
  type AskQuestion,
  type Scenario,
} from "./scenario";

export type Action =
  | { kind: "send"; message: Record<string, unknown> }
  | { kind: "close" }
  | { kind: "abort" };

export interface ResultInfo {
  subtype: string;
  is_error: boolean;
  total_cost_usd: number;
  num_turns?: number;
  session_id?: string;
  usage?: Record<string, unknown>;
  modelUsage?: Record<string, unknown>;
  permission_denials?: unknown[];
}

export interface InitInfo {
  model?: string;
  session_id?: string;
  plugins: { name: string; path: string }[];
}

export interface DriverState {
  status: "running" | "ok" | "failed";
  reason?: string;
  init?: InitInfo;
  /** Completed turns (result events received). */
  turns: number;
  /** Text of the most recent assistant message carrying text in the current turn. */
  lastText: string;
  /** Every assistant text block of the run, in order. */
  allText: string[];
  usedFollowUps: Set<number>;
  /** Turn after which the run ends successfully (set when endWhen.afterFollowUp is sent). */
  endAfterTurn?: number;
  results: ResultInfo[];
  toolCounts: Record<string, number>;
  sessionId?: string;
  /** True when endWhen.toolCommandMatches ended the run inside a turn (process stopped). */
  endedMidTurn: boolean;
  /** endWhen.toolCommandAfter has matched an earlier tool command. */
  toolAfterSeen: boolean;
}

export interface DriverContext {
  scenario: Scenario;
  /** realpath of the plugin root passed to --plugin-dir. */
  pluginRoot: string;
}

const PLUGIN_NAME = "project-workflows";

export function newDriverState(): DriverState {
  return {
    status: "running",
    turns: 0,
    lastText: "",
    allText: [],
    usedFollowUps: new Set(),
    results: [],
    toolCounts: {},
    endedMidTurn: false,
    toolAfterSeen: false,
  };
}

export function userMessage(text: string): Record<string, unknown> {
  return { type: "user", message: { role: "user", content: text } };
}

function controlResponse(requestId: string, response: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "control_response",
    response: { subtype: "success", request_id: requestId, response },
  };
}

/** Returns an error string unless exactly one project-workflows plugin is loaded from pluginRoot. */
export function checkInit(plugins: { name: string; path: string }[], pluginRoot: string): string | null {
  const matches = plugins.filter((p) => p.name === PLUGIN_NAME);
  const root = resolve(pluginRoot);
  if (matches.length !== 1 || resolve(matches[0].path) !== root) {
    return `plugin isolation check failed: expected exactly one ${PLUGIN_NAME} at ${root}, got ${JSON.stringify(plugins)}`;
  }
  return null;
}

/** Per-turn costs from the cumulative total_cost_usd of consecutive results. */
export function turnCostDeltas(totals: number[]): number[] {
  return totals.map((t, i) => Number((t - (i === 0 ? 0 : totals[i - 1])).toFixed(6)));
}

function fail(state: DriverState, reason: string): void {
  if (state.status === "running") {
    state.status = "failed";
    state.reason = reason;
  }
}

function excerpt(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function onAssistant(state: DriverState, event: any, ctx: DriverContext): Action[] {
  const content = event.message?.content;
  if (!Array.isArray(content)) return [];
  const text = content
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n");
  if (text) {
    state.lastText = text;
    state.allText.push(text);
  }
  if (state.status !== "running") return [];
  for (const block of content) {
    const command = block?.type === "tool_use" ? block.input?.command : undefined;
    if (typeof command !== "string") continue;
    const res = toolEndConditionMet(ctx.scenario.endWhen, command, state.toolAfterSeen);
    state.toolAfterSeen = res.afterSeen;
    if (res.end) {
      state.status = "ok";
      state.endedMidTurn = true;
      return [{ kind: "abort" }];
    }
  }
  return [];
}

function onPermission(state: DriverState, event: any, ctx: DriverContext): Action[] {
  const req = event.request;
  const tool: string = req.tool_name;
  const input = req.input ?? {};
  state.toolCounts[tool] = (state.toolCounts[tool] ?? 0) + 1;

  // Any command-running tool (Bash, Monitor, future ones) carries `input.command`.
  if (ctx.scenario.writes && typeof input.command === "string") {
    const reason = foreignWriteReason(input.command);
    if (reason) {
      fail(state, `sandbox guard: ${reason}`);
      return [
        {
          kind: "send",
          message: controlResponse(event.request_id, {
            behavior: "deny",
            message: `Refused by the cost-eval sandbox guard: ${reason}. The run is stopping.`,
          }),
        },
        { kind: "abort" },
      ];
    }
  }
  if (tool !== "AskUserQuestion") {
    return [{ kind: "send", message: controlResponse(event.request_id, { behavior: "allow", updatedInput: input }) }];
  }
  const questions: AskQuestion[] = Array.isArray(input.questions) ? input.questions : [];
  const res = answerQuestions(ctx.scenario.askAnswers, questions);
  if (!res.ok) {
    fail(state, `unscripted question: ${res.question}`);
    return [
      {
        kind: "send",
        message: controlResponse(event.request_id, {
          behavior: "deny",
          message: "No scripted answer for this question; the cost-eval run is stopping.",
        }),
      },
      { kind: "abort" },
    ];
  }
  return [
    {
      kind: "send",
      message: controlResponse(event.request_id, {
        behavior: "allow",
        updatedInput: { ...input, answers: res.answers },
      }),
    },
  ];
}

function onResult(state: DriverState, event: any, ctx: DriverContext): Action[] {
  state.results.push({
    subtype: event.subtype,
    is_error: Boolean(event.is_error),
    total_cost_usd: Number(event.total_cost_usd ?? 0),
    num_turns: event.num_turns,
    session_id: event.session_id,
    usage: event.usage,
    modelUsage: event.modelUsage,
    permission_denials: event.permission_denials,
  });
  if (event.session_id) state.sessionId = event.session_id;
  state.turns += 1;

  if (event.subtype !== "success" || event.is_error) {
    fail(state, `result ${event.subtype}${event.is_error ? " (is_error)" : ""}`);
    return [{ kind: "close" }];
  }
  if (state.status !== "running") return [{ kind: "close" }];

  const lastText = state.lastText;
  const afterReply = state.endAfterTurn !== undefined && state.turns >= state.endAfterTurn;
  if (afterReply || endConditionMet(ctx.scenario.endWhen, lastText, state.turns)) {
    state.status = "ok";
    return [{ kind: "close" }];
  }
  const idx = pickFollowUp(ctx.scenario.followUps, lastText, state.usedFollowUps);
  if (idx < 0) {
    fail(state, `unscripted pause: ${excerpt(lastText)}`);
    return [{ kind: "close" }];
  }
  state.usedFollowUps.add(idx);
  if (idx === ctx.scenario.endWhen.afterFollowUp) state.endAfterTurn = state.turns + 1;
  state.lastText = "";
  return [{ kind: "send", message: userMessage(ctx.scenario.followUps[idx].reply) }];
}

/** Advance the driver by one stdout event. Mutates `state`; returns host actions. */
export function step(state: DriverState, event: any, ctx: DriverContext): Action[] {
  if (!event || typeof event !== "object") return [];

  if (event.type === "system" && event.subtype === "init" && !state.init) {
    const plugins = Array.isArray(event.plugins) ? event.plugins : [];
    state.init = { model: event.model, session_id: event.session_id, plugins };
    if (event.session_id) state.sessionId = event.session_id;
    const err = checkInit(plugins, ctx.pluginRoot);
    if (err) {
      fail(state, err);
      return [{ kind: "abort" }];
    }
    return [];
  }
  if (event.type === "assistant") return onAssistant(state, event, ctx);
  if (event.type === "control_request") {
    if (!state.init) {
      fail(state, "control_request received before system/init; plugin isolation unverified");
      return [{ kind: "abort" }];
    }
    if (event.request?.subtype === "can_use_tool") return onPermission(state, event, ctx);
    fail(state, `unsupported control_request subtype: ${event.request?.subtype}`);
    return [{ kind: "abort" }];
  }
  if (event.type === "result") return onResult(state, event, ctx);
  return [];
}

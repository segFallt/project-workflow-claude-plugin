/**
 * Scenario definitions: loading, schema validation, template rendering, and the
 * pure matching rules (follow-ups, AskUserQuestion answers, end conditions)
 * used by the stream driver.
 */

import { readFile } from "fs/promises";

export interface FollowUp {
  match: string;
  reply: string;
  /** Allow this follow-up to be used more than once (default: single use). */
  repeat?: boolean;
}

export interface AskAnswer {
  question: string;
  /** Option label, comma-joined labels (multiSelect), or "$first". */
  answer: string;
}

export interface EndWhen {
  assistantMatches?: string;
  maxTurns?: number;
}

export interface Capture {
  /** Context variable to record, e.g. CREATED_ISSUE_IID. */
  var: string;
  /** Regex applied to all assistant text of the run; group 1 is captured (last match wins). */
  pattern: string;
  /** Fail the run when nothing matches. */
  required?: boolean;
}

export interface Scenario {
  id: string;
  description: string;
  writes: boolean;
  cwd: "sandbox" | "temp";
  prompt: string;
  followUps: FollowUp[];
  askAnswers: AskAnswer[];
  endWhen: EndWhen;
  maxBudgetUsd: number;
  model?: string;
  capture?: Capture[];
}

export interface AskQuestion {
  question: string;
  multiSelect?: boolean;
  options?: { label: string }[];
}

const FIRST_OPTION = "$first";

/**
 * Build a RegExp from a scenario pattern. A leading "(?i)" (PCRE-style, not
 * supported by JS) is translated into the "i" flag.
 */
export function toRegExp(pattern: string, extraFlags = ""): RegExp {
  const ci = pattern.startsWith("(?i)");
  return new RegExp(ci ? pattern.slice(4) : pattern, (ci ? "i" : "") + extraFlags);
}

function compile(pattern: string, where: string, errors: string[]): void {
  try {
    toRegExp(pattern);
  } catch (err) {
    errors.push(`${where}: invalid regex ${JSON.stringify(pattern)} (${(err as Error).message})`);
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Validate a parsed scenario object; throws one error listing every problem. */
export function validateScenario(raw: unknown, source: string): Scenario {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${source}: scenario must be a JSON object`);
  }
  const s = raw as Record<string, unknown>;

  for (const key of ["id", "description", "prompt"]) {
    if (!isNonEmptyString(s[key])) errors.push(`${key}: required non-empty string`);
  }
  if (typeof s.writes !== "boolean") errors.push("writes: required boolean");
  if (s.cwd !== "sandbox" && s.cwd !== "temp") errors.push('cwd: must be "sandbox" or "temp"');
  if (s.writes === true && s.cwd !== "sandbox") errors.push('cwd: write scenarios must use "sandbox"');
  if (typeof s.maxBudgetUsd !== "number" || !(s.maxBudgetUsd > 0)) {
    errors.push("maxBudgetUsd: required positive number");
  }
  if (s.model !== undefined && !isNonEmptyString(s.model)) errors.push("model: must be a non-empty string");

  if (!Array.isArray(s.followUps)) {
    errors.push("followUps: required array");
  } else {
    s.followUps.forEach((f, i) => {
      const fu = f as Record<string, unknown>;
      if (!isNonEmptyString(fu?.match)) errors.push(`followUps[${i}].match: required string`);
      else compile(fu.match, `followUps[${i}].match`, errors);
      if (!isNonEmptyString(fu?.reply)) errors.push(`followUps[${i}].reply: required string`);
      if (fu?.repeat !== undefined && typeof fu.repeat !== "boolean") {
        errors.push(`followUps[${i}].repeat: must be boolean`);
      }
    });
  }

  if (!Array.isArray(s.askAnswers)) {
    errors.push("askAnswers: required array");
  } else {
    s.askAnswers.forEach((a, i) => {
      const aa = a as Record<string, unknown>;
      if (!isNonEmptyString(aa?.question)) errors.push(`askAnswers[${i}].question: required string`);
      else compile(aa.question, `askAnswers[${i}].question`, errors);
      if (!isNonEmptyString(aa?.answer)) errors.push(`askAnswers[${i}].answer: required string`);
    });
  }

  const end = s.endWhen as Record<string, unknown> | undefined;
  if (!end || typeof end !== "object") {
    errors.push("endWhen: required object");
  } else {
    if (end.assistantMatches === undefined && end.maxTurns === undefined) {
      errors.push("endWhen: needs assistantMatches and/or maxTurns");
    }
    if (end.assistantMatches !== undefined) {
      if (!isNonEmptyString(end.assistantMatches)) errors.push("endWhen.assistantMatches: must be a string");
      else compile(end.assistantMatches, "endWhen.assistantMatches", errors);
    }
    if (end.maxTurns !== undefined && !(Number.isInteger(end.maxTurns) && (end.maxTurns as number) > 0)) {
      errors.push("endWhen.maxTurns: must be a positive integer");
    }
  }

  if (s.capture !== undefined) {
    if (!Array.isArray(s.capture)) {
      errors.push("capture: must be an array");
    } else {
      s.capture.forEach((c, i) => {
        const cc = c as Record<string, unknown>;
        if (!isNonEmptyString(cc?.var) || !/^[A-Z][A-Z0-9_]*$/.test(cc.var)) {
          errors.push(`capture[${i}].var: required UPPER_SNAKE name`);
        }
        if (!isNonEmptyString(cc?.pattern)) errors.push(`capture[${i}].pattern: required string`);
        else compile(cc.pattern, `capture[${i}].pattern`, errors);
      });
    }
  }

  if (errors.length > 0) {
    throw new Error(`${source}: invalid scenario\n  - ${errors.join("\n  - ")}`);
  }
  return s as unknown as Scenario;
}

export async function loadScenario(path: string): Promise<Scenario> {
  const text = await readFile(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${path}: invalid JSON (${(err as Error).message})`);
  }
  return validateScenario(parsed, path);
}

/** Replace {{VAR}} placeholders; throws if any referenced variable is missing. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  const missing = new Set<string>();
  const out = text.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, name: string) => {
    if (vars[name] === undefined) {
      missing.add(name);
      return "";
    }
    return vars[name];
  });
  if (missing.size > 0) {
    throw new Error(
      `unresolved template variable(s): ${[...missing].join(", ")} — run the producing scenario first or pass --var NAME=value`,
    );
  }
  return out;
}

/** Context vars plus PLUGIN_ROOT, which always names the plugin under test. */
export function templateVars(vars: Record<string, string>, pluginRoot: string): Record<string, string> {
  return { ...vars, PLUGIN_ROOT: pluginRoot };
}

/** Render every user-facing string of a scenario against the context vars. */
export function renderScenario(s: Scenario, vars: Record<string, string>): Scenario {
  return {
    ...s,
    prompt: renderTemplate(s.prompt, vars),
    followUps: s.followUps.map((f) => ({ ...f, reply: renderTemplate(f.reply, vars) })),
  };
}

/** True when the end condition holds after `turns` completed turns. */
export function endConditionMet(end: EndWhen, lastText: string, turns: number): boolean {
  if (end.assistantMatches !== undefined && toRegExp(end.assistantMatches).test(lastText)) return true;
  return end.maxTurns !== undefined && turns >= end.maxTurns;
}

/**
 * Index of the first follow-up whose regex matches and that is still usable
 * (unused, or marked repeat); -1 when none.
 */
export function pickFollowUp(followUps: FollowUp[], lastText: string, used: Set<number>): number {
  return followUps.findIndex(
    (f, i) => (f.repeat || !used.has(i)) && toRegExp(f.match).test(lastText),
  );
}

export type AnswerResult =
  | { ok: true; answers: Record<string, string> }
  | { ok: false; question: string };

/** Resolve answers for every AskUserQuestion question, or report the first unscripted one. */
export function answerQuestions(askAnswers: AskAnswer[], questions: AskQuestion[]): AnswerResult {
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const rule = askAnswers.find((a) => toRegExp(a.question).test(q.question));
    if (!rule) return { ok: false, question: q.question };
    if (rule.answer === FIRST_OPTION) {
      const first = q.options?.[0]?.label;
      if (!first) return { ok: false, question: q.question };
      answers[q.question] = first;
    } else {
      answers[q.question] = rule.answer
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .join(", ");
    }
  }
  return { ok: true, answers };
}

/** Apply capture rules to the run's assistant text (last match wins). */
export function applyCaptures(
  captures: Capture[] | undefined,
  texts: string[],
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const c of captures ?? []) {
    let found: string | undefined;
    const re = toRegExp(c.pattern, "g");
    for (const t of texts) {
      for (const m of t.matchAll(re)) if (m[1] !== undefined) found = m[1];
    }
    if (found !== undefined) values[c.var] = found;
    else if (c.required) missing.push(c.var);
  }
  return { values, missing };
}

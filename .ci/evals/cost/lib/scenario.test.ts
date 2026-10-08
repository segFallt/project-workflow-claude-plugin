import { describe, expect, test } from "bun:test";
import { readdirSync } from "fs";
import { join } from "path";
import {
  answerQuestions,
  applyCaptures,
  endConditionMet,
  loadScenario,
  pickFollowUp,
  renderTemplate,
  templateVars,
  toRegExp,
  validateScenario,
} from "./scenario";

const valid = {
  id: "x",
  description: "d",
  writes: false,
  cwd: "temp",
  prompt: "p",
  followUps: [],
  askAnswers: [],
  endWhen: { maxTurns: 1 },
  maxBudgetUsd: 1,
};

describe("validateScenario", () => {
  test("accepts a valid scenario", () => {
    expect(validateScenario(valid, "s.json").id).toBe("x");
  });

  test("lists every problem in one error", () => {
    const bad = { ...valid, id: "", cwd: "elsewhere", maxBudgetUsd: 0, endWhen: {}, followUps: [{ match: "(", reply: "" }] };
    let message = "";
    try {
      validateScenario(bad, "bad.json");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("bad.json: invalid scenario");
    for (const part of ["id:", "cwd:", "maxBudgetUsd:", "endWhen:", "followUps[0].match: invalid regex", "followUps[0].reply"]) {
      expect(message).toContain(part);
    }
  });

  test("rejects write scenarios outside the sandbox", () => {
    expect(() => validateScenario({ ...valid, writes: true, cwd: "temp" }, "s.json")).toThrow('must use "sandbox"');
  });

  test("endWhen.afterFollowUp must index followUps", () => {
    const fu = [{ match: "x", reply: "y" }];
    expect(validateScenario({ ...valid, followUps: fu, endWhen: { afterFollowUp: 0 } }, "s.json").endWhen.afterFollowUp).toBe(0);
    expect(() => validateScenario({ ...valid, followUps: fu, endWhen: { afterFollowUp: 1 } }, "s.json")).toThrow(
      "endWhen.afterFollowUp",
    );
  });

  test("rejects a non-object", () => {
    expect(() => validateScenario([], "s.json")).toThrow("must be a JSON object");
  });

  test("every shipped scenario file is valid", async () => {
    const dir = join(import.meta.dir, "..", "scenarios");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(11);
    for (const f of files) {
      const s = await loadScenario(join(dir, f));
      expect(`${s.id}.json`).toBe(f);
    }
  });
});

describe("toRegExp", () => {
  test("translates a leading (?i) into the i flag", () => {
    expect(toRegExp("(?i)pipeline green").test("Pipeline GREEN")).toBe(true);
    expect(toRegExp("pipeline").test("Pipeline")).toBe(false);
    expect(toRegExp("(?i)x", "g").flags).toBe("gi");
  });
});

describe("renderTemplate", () => {
  test("substitutes known vars and reports missing ones", () => {
    expect(renderTemplate("#{{SEED_ISSUE_IID}}", { SEED_ISSUE_IID: "7" })).toBe("#7");
    expect(() => renderTemplate("#{{CREATED_ISSUE_IID}}", {})).toThrow("CREATED_ISSUE_IID");
  });
});

describe("templateVars", () => {
  test("fills PLUGIN_ROOT from the plugin under test, keeping other vars", () => {
    const vars = templateVars({ SEED_ISSUE_IID: "7" }, "/plugins/pw");
    expect(renderTemplate("{{PLUGIN_ROOT}}/shared/api-dispatch.md #{{SEED_ISSUE_IID}}", vars)).toBe(
      "/plugins/pw/shared/api-dispatch.md #7",
    );
  });

  test("the plugin under test overrides a stale PLUGIN_ROOT from context", () => {
    expect(templateVars({ PLUGIN_ROOT: "/old" }, "/plugins/pw").PLUGIN_ROOT).toBe("/plugins/pw");
  });
});

describe("pickFollowUp", () => {
  const fus = [
    { match: "(?i)design", reply: "Approved." },
    { match: "(?i)lint", reply: "Create the CR." },
  ];
  test("returns the first unused match", () => {
    expect(pickFollowUp(fus, "Design ready; lint passes", new Set())).toBe(0);
    expect(pickFollowUp(fus, "Design ready; lint passes", new Set([0]))).toBe(1);
  });
  test("returns -1 when nothing matches", () => {
    expect(pickFollowUp(fus, "nothing relevant", new Set())).toBe(-1);
  });
});

describe("answerQuestions", () => {
  const options = [{ label: "Alpha" }, { label: "Beta" }];
  test("$first picks the first option label", () => {
    const r = answerQuestions([{ question: ".*", answer: "$first" }], [{ question: "Pick?", options }]);
    expect(r).toEqual({ ok: true, answers: { "Pick?": "Alpha" } });
  });
  test("multiSelect comma lists are normalised", () => {
    const r = answerQuestions([{ question: "(?i)labels", answer: "Alpha,Beta" }], [
      { question: "Which labels?", multiSelect: true, options },
    ]);
    expect(r).toEqual({ ok: true, answers: { "Which labels?": "Alpha, Beta" } });
  });
  test("first matching rule wins", () => {
    const r = answerQuestions(
      [
        { question: "milestone", answer: "None" },
        { question: ".*", answer: "$first" },
      ],
      [{ question: "Which milestone?", options }, { question: "Type?", options }],
    );
    expect(r).toEqual({ ok: true, answers: { "Which milestone?": "None", "Type?": "Alpha" } });
  });
  test("reports an unscripted question", () => {
    expect(answerQuestions([{ question: "milestone", answer: "None" }], [{ question: "Type?" }])).toEqual({
      ok: false,
      question: "Type?",
    });
  });
});

describe("endConditionMet", () => {
  test("regex, maxTurns, or either", () => {
    expect(endConditionMet({ assistantMatches: "/-/issues/\\d+" }, "see /-/issues/12", 1)).toBe(true);
    expect(endConditionMet({ assistantMatches: "/-/issues/\\d+" }, "not yet", 5)).toBe(false);
    expect(endConditionMet({ maxTurns: 2 }, "", 1)).toBe(false);
    expect(endConditionMet({ maxTurns: 2 }, "", 2)).toBe(true);
    expect(endConditionMet({ assistantMatches: "done", maxTurns: 3 }, "not yet", 3)).toBe(true);
    expect(endConditionMet({ assistantMatches: "done", maxTurns: 3 }, "done", 1)).toBe(true);
  });
});

describe("applyCaptures", () => {
  test("last match wins; required misses are reported", () => {
    const r = applyCaptures(
      [
        { var: "DEV_MR_IID", pattern: "/-/merge_requests/(\\d+)" },
        { var: "CREATED_ISSUE_IID", pattern: "/-/issues/(\\d+)", required: true },
      ],
      ["opened /-/merge_requests/3", "updated /-/merge_requests/4"],
    );
    expect(r).toEqual({ values: { DEV_MR_IID: "4" }, missing: ["CREATED_ISSUE_IID"] });
  });
});

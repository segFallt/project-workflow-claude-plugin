import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { allowedProjectId, checkProjectMd, checkSandbox, projectPathFromRemote } from "./guard";

const PROJECT = "code-agent-workspace/agent-sandbox";
const PROJECT_MD = readFileSync(
  join(import.meta.dir, "..", "sandbox", "payload", ".claude", "project-config", "PROJECT.md"),
  "utf8",
);

describe("projectPathFromRemote", () => {
  test.each([
    "https://gitlab.example.test/code-agent-workspace/agent-sandbox.git",
    "https://gitlab.example.test/code-agent-workspace/agent-sandbox",
    "https://oauth2:fake-token@gitlab.example.test/code-agent-workspace/agent-sandbox.git",
    "git@gitlab.example.test:code-agent-workspace/agent-sandbox.git",
    "ssh://git@gitlab.example.test:2222/code-agent-workspace/agent-sandbox.git",
  ])("parses %s", (url) => {
    expect(projectPathFromRemote(url)).toBe(PROJECT);
  });
  test("returns null for garbage", () => {
    expect(projectPathFromRemote("not a url")).toBeNull();
  });
});

describe("checkProjectMd", () => {
  test("accepts the shipped sandbox PROJECT.md", () => {
    expect(checkProjectMd(PROJECT_MD, PROJECT)).toEqual([]);
  });
  test("rejects a different group and missing repo", () => {
    const other = PROJECT_MD.replace("`code-agent-workspace` |", "`other-group` |").replace(
      "| agent-sandbox |",
      "| real-repo |",
    );
    const errors = checkProjectMd(other, PROJECT);
    expect(errors).toHaveLength(2);
  });
});

describe("checkSandbox", () => {
  const base = {
    realCwd: "/home/u/cost-eval/agent-sandbox",
    remoteUrl: "git@gitlab.example.test:code-agent-workspace/agent-sandbox.git",
    projectMd: PROJECT_MD,
    project: PROJECT,
    tempRoots: ["/tmp", "/tmp/claude-1000"],
  };
  test("accepts the sandbox clone", () => {
    expect(checkSandbox(base)).toEqual([]);
  });
  test("rejects another repo", () => {
    const errors = checkSandbox({ ...base, remoteUrl: "https://gitlab.example.test/code-agent-workspace/project-workflow-claude-plugin.git" });
    expect(errors.join()).toContain("expected \"code-agent-workspace/agent-sandbox\"");
  });
  test("rejects missing remote and missing PROJECT.md", () => {
    const errors = checkSandbox({ ...base, remoteUrl: null, projectMd: null });
    expect(errors).toHaveLength(2);
  });
  test("rejects a temp cwd", () => {
    const errors = checkSandbox({ ...base, realCwd: "/tmp/claude-1000/cost-eval-abc" });
    expect(errors.join()).toContain("temp directory");
  });
});

describe("allowedProjectId", () => {
  test("defaults to the sandbox id only when neither variable is set", () => {
    expect(allowedProjectId({})).toBe("49");
    expect(allowedProjectId({ COST_EVAL_PROJECT: PROJECT })).toBe("49");
  });
  test("uses COST_EVAL_PROJECT_ID when set", () => {
    expect(allowedProjectId({ COST_EVAL_PROJECT: "g/other", COST_EVAL_PROJECT_ID: "7" })).toBe("7");
  });
  test("throws when the project is overridden without its id", () => {
    expect(() => allowedProjectId({ COST_EVAL_PROJECT: "g/other" })).toThrow("COST_EVAL_PROJECT_ID");
  });
});

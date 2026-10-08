import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { assertUserSettingsSafe, buildClaudeArgs, hostOutcomeFailure, userSettingsRisk } from "./claude";

describe("buildClaudeArgs", () => {
  test("pins the prompting permission mode alongside the stdio prompt tool", () => {
    const args = buildClaudeArgs({ pluginRoot: "/p", maxBudgetUsd: 1 });
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("manual");
    expect(args[args.indexOf("--permission-prompt-tool") + 1]).toBe("stdio");
  });

  test("adds --strict-mcp-config only when asked", () => {
    expect(buildClaudeArgs({ pluginRoot: "/p", maxBudgetUsd: 1 })).not.toContain("--strict-mcp-config");
    expect(buildClaudeArgs({ pluginRoot: "/p", maxBudgetUsd: 1, strictMcpConfig: true })).toContain("--strict-mcp-config");
  });
});

describe("userSettingsRisk", () => {
  test("accepts settings that leave every command to the prompt", () => {
    expect(userSettingsRisk("{}")).toEqual([]);
    expect(userSettingsRisk(JSON.stringify({ permissions: { defaultMode: "default", allow: ["Read", "WebFetch(domain:x)"] } }))).toEqual([]);
  });
  test.each(["bypassPermissions", "acceptEdits", "dontAsk", "auto"])("flags defaultMode %s", (mode) => {
    expect(userSettingsRisk(JSON.stringify({ permissions: { defaultMode: mode } }))).toEqual([
      `permissions.defaultMode is "${mode}"`,
    ]);
  });
  test("flags Bash and Monitor allow rules by name", () => {
    const risks = userSettingsRisk(JSON.stringify({ permissions: { allow: ["Bash", "Bash(curl:*)", "Monitor(tail:*)", "Read"] } }));
    expect(risks).toEqual([
      'permissions.allow contains "Bash"',
      'permissions.allow contains "Bash(curl:*)"',
      'permissions.allow contains "Monitor(tail:*)"',
    ]);
  });
  test("flags unparseable settings", () => {
    expect(userSettingsRisk("{")[0]).toContain("not valid JSON");
  });
});

describe("assertUserSettingsSafe", () => {
  test("passes for an absent file and names the rule for a risky one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cost-eval-settings-"));
    try {
      await assertUserSettingsSafe(join(dir, "missing.json"));
      const path = join(dir, "settings.json");
      await writeFile(path, JSON.stringify({ permissions: { allow: ["Bash(git push:*)"] } }));
      await expect(assertUserSettingsSafe(path)).rejects.toThrow('permissions.allow contains "Bash(git push:*)"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("hostOutcomeFailure", () => {
  test("fails an ok run with unparsed lines or a non-zero exit", () => {
    expect(hostOutcomeFailure("ok", 0, 0)).toBeNull();
    expect(hostOutcomeFailure("ok", 0, 2)).toContain("2 unparsed");
    expect(hostOutcomeFailure("ok", 1, 0)).toContain("code 1");
  });
  test("never overrides an existing failure", () => {
    expect(hostOutcomeFailure("failed", 143, 3)).toBeNull();
  });
  test("accepts the non-zero exit of a deliberate mid-turn stop, but not unparsed lines", () => {
    expect(hostOutcomeFailure("ok", 143, 0, true)).toBeNull();
    expect(hostOutcomeFailure("ok", null, 0, true)).toBeNull();
    expect(hostOutcomeFailure("ok", 143, 1, true)).toContain("unparsed");
  });
});

describe("userSettingsRisk hooks (review round 2)", () => {
  test("flags a configured PreToolUse hook", () => {
    const json = JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "x" }] }] } });
    expect(userSettingsRisk(json).join(" ")).toContain("PreToolUse");
  });
  test("ignores an empty PreToolUse list", () => {
    expect(userSettingsRisk(JSON.stringify({ hooks: { PreToolUse: [] } }))).toEqual([]);
  });
});

describe("userSettingsRisk permission hooks (review round 3)", () => {
  test("flags a configured PermissionRequest hook", () => {
    const json = JSON.stringify({ hooks: { PermissionRequest: [{ hooks: [{ type: "command", command: "x" }] }] } });
    expect(userSettingsRisk(json).join(" ")).toContain("PermissionRequest");
  });
});

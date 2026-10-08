import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { envValues, loadCredentials, SandboxGitLab, withCiDelay, type Fetch } from "./gitlab";
import { DEFAULT_HOST } from "./seed";

const CREDS = { hostUrl: "https://gitlab.example.test", token: "fake-token" };
const SANDBOX_API = "https://gitlab.example.test/api/v4/projects/code-agent-workspace%2Fagent-sandbox";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** Records every call and answers from `statuses` in order (the last one repeats). */
function fakeFetch(...statuses: number[]): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({
      url,
      method: String(init.method),
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    return new Response(status === 204 ? null : "{}", { status });
  };
  return { fetch, calls };
}

const savedProject = process.env.COST_EVAL_PROJECT;
afterEach(() => {
  if (savedProject === undefined) delete process.env.COST_EVAL_PROJECT;
  else process.env.COST_EVAL_PROJECT = savedProject;
});

describe("SandboxGitLab", () => {
  test("refuses any project but the sandbox", () => {
    const { fetch } = fakeFetch(200);
    expect(() => new SandboxGitLab(CREDS, fetch, "grp/real-repo")).toThrow(/only the sandbox/);
    process.env.COST_EVAL_PROJECT = "grp/other-sandbox";
    expect(() => new SandboxGitLab(CREDS, fetch, "code-agent-workspace/agent-sandbox")).toThrow(/only the sandbox/);
    expect(new SandboxGitLab(CREDS, fetch).project).toBe("grp/other-sandbox");
  });

  test("setVariable updates in place and sends the token only as a header", async () => {
    const { fetch, calls } = fakeFetch(200);
    await new SandboxGitLab(CREDS, fetch).setVariable("CI_DELAY", "300");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: `${SANDBOX_API}/variables/CI_DELAY`, method: "PUT", body: { value: "300" } });
    expect(calls[0].headers["PRIVATE-TOKEN"]).toBe("fake-token");
    expect(calls[0].url).not.toContain("fake-token");
  });

  test("setVariable creates the variable when it does not exist", async () => {
    const { fetch, calls } = fakeFetch(404, 201);
    await new SandboxGitLab(CREDS, fetch).setVariable("CI_DELAY", "300");
    expect(calls.map((c) => c.method)).toEqual(["PUT", "POST"]);
    expect(calls[1]).toMatchObject({ url: `${SANDBOX_API}/variables`, body: { key: "CI_DELAY", value: "300" } });
  });

  test("setVariable surfaces other failures", async () => {
    const { fetch } = fakeFetch(403);
    await expect(new SandboxGitLab(CREDS, fetch).setVariable("CI_DELAY", "1")).rejects.toThrow(/HTTP 403/);
  });

  test("deleteVariable tolerates a missing variable and rejects bad keys", async () => {
    const { fetch, calls } = fakeFetch(204, 404);
    const client = new SandboxGitLab(CREDS, fetch);
    expect(await client.deleteVariable("CI_DELAY")).toBe(true);
    expect(await client.deleteVariable("CI_DELAY")).toBe(false);
    expect(calls.every((c) => c.method === "DELETE" && c.url === `${SANDBOX_API}/variables/CI_DELAY`)).toBe(true);
    await expect(client.deleteVariable("../x")).rejects.toThrow(/invalid variable key/);
  });
});

describe("withCiDelay", () => {
  test("sets the variable before the run and deletes it after", async () => {
    const { fetch, calls } = fakeFetch(200);
    const order: string[] = [];
    const out = await withCiDelay(new SandboxGitLab(CREDS, fetch), 300, async () => {
      order.push(`run after ${calls.map((c) => c.method).join(",")}`);
      return 7;
    });
    expect(out).toBe(7);
    expect(order).toEqual(["run after PUT"]);
    expect(calls.map((c) => c.method)).toEqual(["PUT", "DELETE"]);
  });

  test("deletes the variable even when the run throws, and keeps the run's error", async () => {
    const { fetch, calls } = fakeFetch(200);
    const run = withCiDelay(new SandboxGitLab(CREDS, fetch), 300, async () => {
      throw new Error("scenario failed");
    });
    await expect(run).rejects.toThrow("scenario failed");
    expect(calls.map((c) => c.method)).toEqual(["PUT", "DELETE"]);
  });

  test("a failed delete is reported, not swallowed silently", async () => {
    const { fetch } = fakeFetch(200, 500);
    const warnings: string[] = [];
    await withCiDelay(new SandboxGitLab(CREDS, fetch), 1, async () => 0, (m) => warnings.push(m));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not delete CI_DELAY");
  });

  test("does not run the scenario when setting the variable fails", async () => {
    const { fetch } = fakeFetch(401);
    let ran = false;
    await expect(
      withCiDelay(new SandboxGitLab(CREDS, fetch), 1, async () => {
        ran = true;
      }),
    ).rejects.toThrow(/HTTP 401/);
    expect(ran).toBe(false);
  });
});

describe("credentials", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  test("envValues strips quotes and export prefixes", () => {
    const text = "# c\nexport API_TOKEN_ENV_VAR='fake-quoted'\nREPO_HOST_URL=https://gitlab.example.test\nOTHER=x\n";
    expect(envValues(text, ["API_TOKEN_ENV_VAR", "REPO_HOST_URL"])).toEqual({
      API_TOKEN_ENV_VAR: "fake-quoted",
      REPO_HOST_URL: "https://gitlab.example.test",
    });
  });

  test("loadCredentials reads the env source and falls back to the default host", async () => {
    dir = await mkdtemp(join(tmpdir(), "cost-eval-gitlab-"));
    const env = join(dir, ".env");
    await writeFile(env, "API_TOKEN_ENV_VAR=fake-token\nREPO_HOST_URL=\n");
    expect(await loadCredentials(env)).toEqual({ hostUrl: DEFAULT_HOST, token: "fake-token" });
    await writeFile(env, "REPO_HOST_URL=https://gitlab.example.test\n");
    await expect(loadCredentials(env)).rejects.toThrow(/no API_TOKEN_ENV_VAR/);
  });
});

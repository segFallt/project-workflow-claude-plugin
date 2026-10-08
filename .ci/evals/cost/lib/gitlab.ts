/**
 * Minimal GitLab client for runner-side sandbox setup (#73): sets and deletes
 * CI/CD variables on the sandbox project only. `fetch` is injected so tests
 * never touch the network; the token is sent as a header, never in a URL.
 */

import { readFile } from "fs/promises";
import { allowedProject } from "./guard";
import { DEFAULT_HOST, filterEnv } from "./seed";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface GitLabCredentials {
  hostUrl: string;
  token: string;
}

/** `KEY=value` pairs (optional `export`, optional quotes) for `keys`, first occurrence wins. */
export function envValues(text: string, keys: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of filterEnv(text, keys).content.split("\n")) {
    const m = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const raw = m[2].trim();
    values[m[1]] = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
  }
  return values;
}

/** API token and host from the COST_EVAL_ENV_SOURCE file; REPO_HOST_URL falls back to the default host. */
export async function loadCredentials(envSource: string): Promise<GitLabCredentials> {
  const values = envValues(await readFile(envSource, "utf8"), ["API_TOKEN_ENV_VAR", "REPO_HOST_URL"]);
  if (!values.API_TOKEN_ENV_VAR) throw new Error(`${envSource} has no API_TOKEN_ENV_VAR value`);
  return { hostUrl: values.REPO_HOST_URL || DEFAULT_HOST, token: values.API_TOKEN_ENV_VAR };
}

const VARIABLE_KEY = /^[A-Za-z0-9_]+$/;

export class SandboxGitLab {
  private readonly api: string;

  constructor(
    private readonly creds: GitLabCredentials,
    private readonly fetchFn: Fetch,
    readonly project: string = allowedProject(),
  ) {
    if (project !== allowedProject()) {
      throw new Error(`refusing GitLab project ${JSON.stringify(project)}: only the sandbox ${allowedProject()} is allowed`);
    }
    const { origin } = new URL(creds.hostUrl);
    this.api = `${origin}/api/v4/projects/${encodeURIComponent(project)}`;
  }

  private async call(method: string, path: string, body?: Record<string, string>): Promise<Response> {
    return this.fetchFn(`${this.api}${path}`, {
      method,
      headers: { "PRIVATE-TOKEN": this.creds.token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private static async fail(what: string, res: Response): Promise<never> {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`${what} failed: HTTP ${res.status} ${text}`);
  }

  /** Create or update a plain (unprotected, unmasked) project CI/CD variable. */
  async setVariable(key: string, value: string): Promise<void> {
    if (!VARIABLE_KEY.test(key)) throw new Error(`invalid variable key ${JSON.stringify(key)}`);
    const updated = await this.call("PUT", `/variables/${key}`, { value });
    if (updated.ok) return;
    if (updated.status !== 404) return SandboxGitLab.fail(`update variable ${key}`, updated);
    const created = await this.call("POST", "/variables", { key, value, protected: "false", masked: "false" });
    if (!created.ok) return SandboxGitLab.fail(`create variable ${key}`, created);
  }

  /** Delete a project CI/CD variable; returns false when it did not exist. */
  async deleteVariable(key: string): Promise<boolean> {
    if (!VARIABLE_KEY.test(key)) throw new Error(`invalid variable key ${JSON.stringify(key)}`);
    const res = await this.call("DELETE", `/variables/${key}`);
    if (res.status === 404) return false;
    if (!res.ok) return SandboxGitLab.fail(`delete variable ${key}`, res);
    return true;
  }
}

export const CI_DELAY_VARIABLE = "CI_DELAY";

/**
 * Run `fn` with the sandbox's CI_DELAY variable set to `seconds`, deleting it
 * afterwards even when `fn` throws. A failed delete is reported on stderr and
 * does not mask `fn`'s own error.
 */
export async function withCiDelay<T>(
  client: SandboxGitLab,
  seconds: number,
  fn: () => Promise<T>,
  warn: (msg: string) => void = (m) => process.stderr.write(`${m}\n`),
): Promise<T> {
  await client.setVariable(CI_DELAY_VARIABLE, String(seconds));
  try {
    return await fn();
  } finally {
    try {
      await client.deleteVariable(CI_DELAY_VARIABLE);
    } catch (err) {
      warn(`WARNING: could not delete ${CI_DELAY_VARIABLE} on ${client.project}: ${(err as Error).message}`);
    }
  }
}

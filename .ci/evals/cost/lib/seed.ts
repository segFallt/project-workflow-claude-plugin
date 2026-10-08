/**
 * Sandbox seeding: clone the throwaway project, commit the payload on a seed
 * branch, and write a credentials .env containing only the allowed keys.
 * Never pushes or calls the API — it prints the operator commands instead.
 */

import { access, chmod, cp, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { allowedProject, assertSandboxRemote } from "./guard";

export const SEED_BRANCH = "chore/seed-cost-eval";
export const ENV_KEYS = ["API_TOKEN_ENV_VAR", "REVIEW_TOKEN_ENV_VAR", "REPO_HOST_URL"];
export const DEFAULT_HOST = "https://gitlab.n3.pingleberry.com";
/** Work item the seed commit and operator MR title cite unless SeedOptions.workItem says otherwise. */
export const DEFAULT_WORK_ITEM = "#68";

/** Keep only `KEY=value` lines (optionally `export`-prefixed) for the allowed keys. */
export function filterEnv(text: string, keys = ENV_KEYS): { content: string; found: string[] } {
  const found: string[] = [];
  const lines = text.split("\n").filter((line) => {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)=/);
    if (!m || !keys.includes(m[1]) || found.includes(m[1])) return false;
    found.push(m[1]);
    return true;
  });
  return { content: lines.length ? lines.map((l) => l.trim()).join("\n") + "\n" : "", found };
}

function git(args: string[], cwd?: string): string {
  const res = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (res.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed (exit ${res.exitCode}): ${res.stderr.toString().trim()}`);
  }
  return res.stdout.toString().trim();
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

export interface SeedOptions {
  sandboxDir: string;
  payloadDir: string;
  envSource: string;
  /** Work item cited in the seed commit message and the operator MR title, e.g. "#73". */
  workItem?: string;
}

export function seedCommitMessage(workItem = DEFAULT_WORK_ITEM): string {
  return `chore: seed cost-eval sandbox payload (${workItem})`;
}

/** Seed the sandbox clone; returns operator instructions to print. */
export async function seedSandbox(opts: SeedOptions): Promise<string[]> {
  const project = allowedProject();
  const notes: string[] = [];
  const name = process.env.GIT_USER_NAME;
  const email = process.env.GIT_USER_EMAIL;
  if (!name || !email) throw new Error("GIT_USER_NAME and GIT_USER_EMAIL must be set for the seed commit");

  if (!(await exists(opts.sandboxDir))) {
    const url = process.env.COST_EVAL_CLONE_URL ?? `${DEFAULT_HOST}/${project}.git`;
    await mkdir(dirname(opts.sandboxDir), { recursive: true });
    git(["clone", url, opts.sandboxDir]);
    notes.push(`Cloned ${url} into ${opts.sandboxDir}`);
  }
  assertSandboxRemote(opts.sandboxDir, project);

  git(["checkout", "-B", SEED_BRANCH], opts.sandboxDir);
  await cp(opts.payloadDir, opts.sandboxDir, { recursive: true, force: true });
  git(["add", "-A"], opts.sandboxDir);
  const staged = git(["diff", "--cached", "--name-only"], opts.sandboxDir);
  if (staged) {
    git(
      ["-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-m", seedCommitMessage(opts.workItem)],
      opts.sandboxDir,
    );
    notes.push(`Committed payload on ${SEED_BRANCH}:\n${staged}`);
  } else {
    notes.push(`Payload already committed on ${SEED_BRANCH}; nothing to commit`);
  }

  const envRel = ".claude/project-config/.env";
  const ignored = Bun.spawnSync(["git", "-C", opts.sandboxDir, "check-ignore", "-q", envRel]).exitCode === 0;
  if (!ignored) throw new Error(`${envRel} is not git-ignored in ${opts.sandboxDir}; refusing to write credentials`);
  const { content, found } = filterEnv(await readFile(opts.envSource, "utf8"));
  if (!found.includes("API_TOKEN_ENV_VAR")) throw new Error(`${opts.envSource} has no API_TOKEN_ENV_VAR line`);
  const missing = ENV_KEYS.filter((k) => !found.includes(k));
  const envPath = join(opts.sandboxDir, envRel);
  await writeFile(envPath, content, { mode: 0o600 });
  await chmod(envPath, 0o600);
  notes.push(`Wrote ${envPath} (mode 600) with ${found.join(", ")}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);

  notes.push(...operatorSteps(opts.sandboxDir, project, DEFAULT_HOST, opts.workItem));
  return notes;
}

/** Token-authenticated push URL for `project` on `host`; the token stays a shell variable. */
export function pushUrl(project: string, host = DEFAULT_HOST): string {
  const { protocol, host: authority } = new URL(host);
  return `${protocol}//oauth2:$API_TOKEN_ENV_VAR@${authority}/${project}.git`;
}

/** Push/MR/issue commands the operator runs by hand after seeding. */
export function operatorSteps(sandboxDir: string, project: string, host = DEFAULT_HOST, workItem = DEFAULT_WORK_ITEM): string[] {
  const encoded = encodeURIComponent(project);
  return [
    "Operator steps (not run by this tool):",
    `  git -C ${sandboxDir} push "${pushUrl(project, host)}" ${SEED_BRANCH}   # no -u: it would persist the token URL`,
    `  curl -sS -X POST -H "PRIVATE-TOKEN: $API_TOKEN_ENV_VAR" "${host}/api/v4/projects/${encoded}/merge_requests" ` +
      `--data-urlencode "source_branch=${SEED_BRANCH}" --data-urlencode "target_branch=main" ` +
      `--data-urlencode "title=chore: seed cost-eval sandbox (${workItem})"`,
    "  Merge that MR, then: git -C <sandbox> checkout main && git -C <sandbox> pull",
    "  Create the seed issue from .ci/evals/cost/sandbox/seed-issue.md and pass its iid via --var SEED_ISSUE_IID=<iid>",
  ];
}

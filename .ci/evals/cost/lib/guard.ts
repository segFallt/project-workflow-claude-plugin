/**
 * Sandbox guard: write scenarios may only run inside a clone of the allowed
 * throwaway project whose PROJECT.md points at that same project.
 */

import { readFile, realpath } from "fs/promises";
import { tmpdir } from "os";
import { join, sep } from "path";

export const DEFAULT_PROJECT = "code-agent-workspace/agent-sandbox";

export function allowedProject(): string {
  return process.env.COST_EVAL_PROJECT ?? DEFAULT_PROJECT;
}

/**
 * Extract "group/.../name" from a git remote URL (https or ssh, optional
 * credentials, optional .git). Returns null when the URL is not recognised.
 */
export function projectPathFromRemote(url: string): string | null {
  const trimmed = url.trim();
  let path: string | undefined;
  const scp = trimmed.match(/^[^@\s/]+@[^:\s/]+:(.+)$/); // git@host:group/name.git
  if (scp) {
    path = scp[1];
  } else {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      return null; // not a URL: caller reports "unrecognised remote"
    }
  }
  const cleaned = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
  return cleaned.includes("/") ? cleaned : null;
}

function section(markdown: string, heading: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

/** Errors (empty when OK) for a PROJECT.md that must target `project`. */
export function checkProjectMd(markdown: string, project: string): string[] {
  const errors: string[] = [];
  const group = project.slice(0, project.lastIndexOf("/"));
  const repo = project.slice(project.lastIndexOf("/") + 1);

  const sc = section(markdown, "Source Control");
  const groupRow = sc?.split("\n").find((l) => /^\|\s*Group\b/.test(l));
  const groupValue = groupRow?.split("|")[2]?.trim().replace(/`/g, "");
  if (groupValue !== group) {
    errors.push(`PROJECT.md Source Control Group is ${JSON.stringify(groupValue ?? null)}, expected "${group}"`);
  }
  const repos = section(markdown, "Repository Locations");
  const listed = repos?.split("\n").some((l) => l.split("|")[1]?.trim().replace(/`/g, "") === repo);
  if (!listed) errors.push(`PROJECT.md Repository Locations does not list "${repo}"`);
  return errors;
}

export interface GuardInput {
  realCwd: string;
  remoteUrl: string | null;
  projectMd: string | null;
  project: string;
  tempRoots: string[];
}

/** Pure guard decision; returns every violated rule. */
export function checkSandbox(input: GuardInput): string[] {
  const errors: string[] = [];
  if (input.tempRoots.some((t) => input.realCwd === t || input.realCwd.startsWith(t + sep))) {
    errors.push(`cwd ${input.realCwd} is a temp directory; write scenarios need the sandbox clone`);
  }
  if (input.remoteUrl === null) {
    errors.push(`cwd ${input.realCwd} has no git remote "origin"`);
  } else {
    const path = projectPathFromRemote(input.remoteUrl);
    if (path !== input.project) {
      errors.push(`origin resolves to ${JSON.stringify(path)} (from remote URL), expected "${input.project}"`);
    }
  }
  if (input.projectMd === null) {
    errors.push(`${join(input.realCwd, ".claude/project-config/PROJECT.md")} not found`);
  } else {
    errors.push(...checkProjectMd(input.projectMd, input.project));
  }
  return errors;
}

async function tempRoots(): Promise<string[]> {
  const roots = new Set<string>(["/tmp", tmpdir()]);
  for (const r of [...roots]) roots.add(await realpath(r).catch(() => r));
  return [...roots];
}

function gitRemote(cwd: string): string | null {
  const res = Bun.spawnSync(["git", "-C", cwd, "remote", "get-url", "origin"], { stderr: "pipe" });
  return res.exitCode === 0 ? res.stdout.toString().trim() : null;
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Throw with every violation unless cwd is the allowed sandbox clone. */
export async function assertSandbox(cwd: string, project = allowedProject()): Promise<void> {
  allowedProjectId(); // fail fast on an overridden project without its id
  const realCwd = await realpath(cwd);
  const errors = checkSandbox({
    realCwd,
    remoteUrl: gitRemote(realCwd),
    projectMd: await readOptional(join(realCwd, ".claude/project-config/PROJECT.md")),
    project,
    tempRoots: await tempRoots(),
  });
  if (errors.length > 0) {
    throw new Error(`sandbox guard refused ${realCwd}:\n  - ${errors.join("\n  - ")}`);
  }
}

/** Remote-only check used by `seed` before PROJECT.md exists. */
export function assertSandboxRemote(cwd: string, project = allowedProject()): void {
  const url = gitRemote(cwd);
  const path = url === null ? null : projectPathFromRemote(url);
  if (path !== project) {
    throw new Error(`${cwd}: origin resolves to ${JSON.stringify(path)}, expected "${project}"`);
  }
}

/**
 * Numeric id of the allowed project; GitLab accepts it in place of the encoded path.
 * The default id only belongs to the default project, so overriding COST_EVAL_PROJECT
 * requires COST_EVAL_PROJECT_ID too.
 */
export function allowedProjectId(env: Record<string, string | undefined> = process.env): string {
  if (env.COST_EVAL_PROJECT_ID) return env.COST_EVAL_PROJECT_ID;
  if (env.COST_EVAL_PROJECT && env.COST_EVAL_PROJECT !== DEFAULT_PROJECT) {
    throw new Error("COST_EVAL_PROJECT is overridden but COST_EVAL_PROJECT_ID is not set; set the sandbox's numeric project id");
  }
  return "49";
}

const HTTP_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
/** `-X POST`, `-XPOST`, `-sX POST`, `--request POST`, `--request=POST`, quoted or not. */
const METHOD_FLAG = /(?:^|\s)(?:-[A-Za-z]*X|--request)[\s=]*['"]?([A-Za-z]+)/g;
/** Body/upload flags: `-d x`, `-d'..'`, `-d@f`, `-sd x`, `-F`, `-T`, `--data*`, `--json`, `--form*`, `--upload-file`. */
const BODY_FLAG = /(?:^|\s)(?:-[A-Za-z]*[dFT]|--data[a-z-]*(?=[\s=]|$)|--json(?=[\s=]|$)|--form[a-z-]*(?=[\s=]|$)|--upload-file(?=[\s=]|$))/;
/**
 * Repository-host CLIs as a command word (optionally after env assignments).
 * Deliberately conservative: read-only calls such as `glab mr view` and `gh pr view`
 * count as writes too, so in a write scenario they must name the sandbox or the run aborts.
 */
const HOST_CLI = /(?:^|[;&|\n(`])\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:glab|gh|tea)(?=\s|$)/;
const PROJECT_REF = /projects\/([A-Za-z0-9_.%~-]+)/g;

/** Shell segments split on `|`, `;`, `&&`, `||` and newlines (line continuations joined first). */
function segments(command: string): string[] {
  return command.replace(/\\\r?\n/g, " ").split(/\|\||&&|[|;\n]/);
}

function isCurlWrite(segment: string): boolean {
  if (!/\bcurl\b/.test(segment)) return false;
  const methods = [...segment.matchAll(METHOD_FLAG)].map((m) => m[1].toUpperCase());
  return methods.some((m) => HTTP_WRITE_METHODS.has(m)) || BODY_FLAG.test(segment);
}

/** `git ... push` in one segment. Conservative: `git log --grep push` matches too (safe direction). */
const GIT_PUSH = /\bgit\b.*\bpush\b/;

function isWriteSegment(segment: string): boolean {
  return isCurlWrite(segment) || GIT_PUSH.test(segment) || HOST_CLI.test(segment);
}

/** True when the command may write to a repository host (curl write, git push, glab/gh/tea). */
export function isHostWrite(command: string): boolean {
  return segments(command).some(isWriteSegment);
}

/** `-R <path>`, `-R<path>`, `--repo <path>`, `--repo=<path>` targets of glab, gh and tea (path or full URL). */
const REPO_FLAG = /(?:^|\s)(?:-R|--repo)(?:[\s=]+|(?=[A-Za-z0-9_.~]))['"]?((?:https?:\/\/[^\s'"\/]+\/)?[A-Za-z0-9_.~\/-]+)/g;
/** Remote URLs (https or ssh) in a `git push`; group 1 is the project path. */
const PUSH_URL = /(?:(?:https?|ssh):\/\/[^\s'"\/]+|[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:)\/?([A-Za-z0-9_.~\/-]+?)(?:\.git)?(?=['"\s]|$)/g;

/** Literal project targets in one write segment (API refs, -R/--repo, push URLs). */
function literalTargets(segment: string): string[] {
  const refs = [...segment.matchAll(PROJECT_REF)].map((m) => m[1]);
  if (HOST_CLI.test(segment)) {
    refs.push(...[...segment.matchAll(REPO_FLAG)].map((m) => m[1].replace(/^https?:\/\/[^/]+\//, "").replace(/\.git$/, "")));
  }
  if (GIT_PUSH.test(segment)) refs.push(...[...segment.matchAll(PUSH_URL)].map((m) => m[1]));
  return refs;
}

/**
 * Returns a reason when a command could write to a repository-host project
 * other than the sandbox, or null when it is allowed. Conservative: a writing
 * command must mention the sandbox, and must not name any other literal project
 * (variable refs such as `projects/$P` are not literal and are not matched).
 */
export function foreignWriteReason(command: string, project = allowedProject(), projectId = allowedProjectId()): string | null {
  if (!isHostWrite(command)) return null;
  const encoded = project.replace(/\//g, "%2F");
  const mentionsSandbox = command.includes(project) || command.includes(encoded) || new RegExp(`projects/${projectId}\\b`).test(command);
  if (!mentionsSandbox) return `write command does not target the sandbox ${project}`;
  const isSandbox = (ref: string) =>
    ref === projectId || [project, encoded].some((p) => ref.toLowerCase() === p.toLowerCase());
  // The sandbox may be named anywhere (e.g. a variable assignment), but every literal target
  // in every writing segment must be the sandbox.
  for (const segment of segments(command).filter(isWriteSegment)) {
    const foreign = literalTargets(segment).find((ref) => !isSandbox(ref));
    if (foreign) return `write command names another project: ${foreign}`;
  }
  return null;
}

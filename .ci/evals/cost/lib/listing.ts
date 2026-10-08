/**
 * Skill-listing A/B helpers: copy the plugin tree into variant dirs, mark the
 * target skills `disable-model-invocation: true` in variant B, and compute the
 * static size of the skill listing each variant exposes to the model.
 */

import { parse as parseYaml } from "yaml";
import { cp, readdir, readFile, stat, writeFile } from "fs/promises";
import { join, relative, sep } from "path";

export const VARIANT_B_DISABLED = ["issue-creation", "testing-prd", "gitlab-api", "github-api", "gitea-api"];

const EXCLUDED = [".git", join(".ci", "node_modules"), join(".ci", "evals", "cost", "out")];
const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;
const DISABLE_KEY = "disable-model-invocation";

/** Copy the plugin root, skipping VCS, installed deps, and run output. */
export async function copyPluginTree(src: string, dest: string): Promise<void> {
  await cp(src, dest, {
    recursive: true,
    filter: (from) => {
      const rel = relative(src, from);
      return !EXCLUDED.some((ex) => rel === ex || rel.startsWith(ex + sep));
    },
  });
}

export function parseFrontmatter(markdown: string, source: string): Record<string, unknown> {
  const m = markdown.match(FRONTMATTER);
  if (!m) throw new Error(`${source}: no frontmatter`);
  const data = parseYaml(m[1]);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${source}: frontmatter is not a mapping`);
  }
  return data as Record<string, unknown>;
}

/** Insert `disable-model-invocation: true` before the closing `---`; verifies the result parses. */
export function insertDisableFlag(markdown: string, source: string): string {
  const m = markdown.match(FRONTMATTER);
  if (!m) throw new Error(`${source}: no frontmatter`);
  if (parseFrontmatter(markdown, source)[DISABLE_KEY] === true) return markdown;
  const body = m[1].split("\n").filter((l) => !l.startsWith(`${DISABLE_KEY}:`));
  const replaced = `---\n${[...body, `${DISABLE_KEY}: true`].join("\n")}\n---${m[2]}`;
  const out = replaced + markdown.slice(m[0].length);
  if (parseFrontmatter(out, source)[DISABLE_KEY] !== true) {
    throw new Error(`${source}: failed to set ${DISABLE_KEY}`);
  }
  return out;
}

export async function skillNames(pluginDir: string): Promise<string[]> {
  const root = join(pluginDir, "skills");
  const names: string[] = [];
  for (const entry of (await readdir(root)).sort()) {
    if ((await stat(join(root, entry))).isDirectory()) names.push(entry);
  }
  return names;
}

/** Apply variant B to a copied plugin dir. */
export async function applyVariantB(pluginDir: string, skills = VARIANT_B_DISABLED): Promise<void> {
  const present = new Set(await skillNames(pluginDir));
  for (const name of skills) {
    if (!present.has(name)) throw new Error(`variant B target skill not found: ${name}`);
    const path = join(pluginDir, "skills", name, "SKILL.md");
    await writeFile(path, insertDisableFlag(await readFile(path, "utf8"), path));
  }
}

export interface ListingStats {
  skills: number;
  listed: number;
  disabled: string[];
  /** Sum of name + description lengths across model-invocable skills. */
  listingChars: number;
}

/** Static listing size: name+description chars of skills not disabled for model invocation. */
export async function listingStats(pluginDir: string): Promise<ListingStats> {
  const names = await skillNames(pluginDir);
  const disabled: string[] = [];
  let listingChars = 0;
  for (const name of names) {
    const path = join(pluginDir, "skills", name, "SKILL.md");
    const fm = parseFrontmatter(await readFile(path, "utf8"), path);
    if (fm[DISABLE_KEY] === true) {
      disabled.push(name);
      continue;
    }
    listingChars += String(fm.name ?? name).length + String(fm.description ?? "").length;
  }
  return { skills: names.length, listed: names.length - disabled.length, disabled, listingChars };
}

/** `claude plugin details <dir>` output (no model call); never throws. */
export function pluginDetails(pluginDir: string): { ok: boolean; output: string } {
  try {
    const res = Bun.spawnSync(["claude", "plugin", "details", pluginDir], { stdout: "pipe", stderr: "pipe" });
    const output = res.exitCode === 0 ? res.stdout.toString() : `exit ${res.exitCode}: ${res.stderr.toString()}`;
    return { ok: res.exitCode === 0, output };
  } catch (err) {
    return { ok: false, output: `spawn failed: ${(err as Error).message}` };
  }
}

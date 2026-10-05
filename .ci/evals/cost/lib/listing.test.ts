import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  VARIANT_B_DISABLED,
  applyVariantB,
  copyPluginTree,
  insertDisableFlag,
  listingStats,
  parseFrontmatter,
  skillNames,
} from "./listing";

const PLUGIN_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

describe("insertDisableFlag", () => {
  test("adds the flag before the closing --- and keeps the body", () => {
    const md = "---\nname: demo\ndescription: Use when demoing — with a dash\n---\n\n# Body\n";
    const out = insertDisableFlag(md, "demo");
    expect(out).toBe("---\nname: demo\ndescription: Use when demoing — with a dash\ndisable-model-invocation: true\n---\n\n# Body\n");
    expect(parseFrontmatter(out, "demo")).toEqual({
      name: "demo",
      description: "Use when demoing — with a dash",
      "disable-model-invocation": true,
    });
  });
  test("replaces an existing false flag instead of duplicating", () => {
    const out = insertDisableFlag("---\nname: d\ndisable-model-invocation: false\n---\nx", "d");
    expect(out.match(/disable-model-invocation/g)).toHaveLength(1);
    expect(parseFrontmatter(out, "d")["disable-model-invocation"]).toBe(true);
  });
  test("throws without frontmatter", () => {
    expect(() => insertDisableFlag("# no frontmatter", "x")).toThrow("no frontmatter");
  });
});

describe("variant B on a copy of the plugin", () => {
  let dir: string;
  beforeAll(async () => {
    dir = join(await mkdtemp(join(tmpdir(), "cost-eval-listing-test-")), "plugin");
    await copyPluginTree(PLUGIN_ROOT, dir);
    await applyVariantB(dir);
  });
  afterAll(async () => {
    await rm(join(dir, ".."), { recursive: true, force: true });
  });

  test("only the five target skills carry the flag and all frontmatter parses", async () => {
    for (const name of await skillNames(dir)) {
      const path = join(dir, "skills", name, "SKILL.md");
      const fm = parseFrontmatter(await readFile(path, "utf8"), path);
      expect(fm["disable-model-invocation"] === true).toBe(VARIANT_B_DISABLED.includes(name));
    }
  });

  test("static listing stats shrink by the disabled skills", async () => {
    const a = await listingStats(PLUGIN_ROOT);
    const b = await listingStats(dir);
    expect(b.disabled.sort()).toEqual([...VARIANT_B_DISABLED].sort());
    expect(b.listed).toBe(a.listed - VARIANT_B_DISABLED.length);
    expect(b.listingChars).toBeLessThan(a.listingChars);
  });

  test("copy excludes .git", async () => {
    expect(await Bun.file(join(dir, ".git", "HEAD")).exists()).toBe(false);
  });

  test("unknown target skill fails loudly", async () => {
    await expect(applyVariantB(dir, ["no-such-skill"])).rejects.toThrow("no-such-skill");
  });
});

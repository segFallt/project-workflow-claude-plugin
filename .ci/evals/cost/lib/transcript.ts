/**
 * Session-transcript attribution: locate a run's JSONL transcripts, dedupe
 * streamed assistant lines per API message, and sum token usage for the
 * coordinator and each sub-agent.
 */

import { cp, mkdir, readdir, readFile } from "fs/promises";
import { homedir } from "os";
import { basename, join } from "path";

export interface TokenTotals {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface MessageUsage extends TokenTotals {
  id: string;
  model?: string;
}

export interface AgentBreakdown {
  file: string;
  agentType?: string;
  description?: string;
  models: string[];
  messages: number;
  tokens: TokenTotals;
}

export interface SessionBreakdown {
  coordinator: AgentBreakdown;
  subagents: AgentBreakdown[];
  total: TokenTotals;
}

const TOKEN_FIELDS: (keyof TokenTotals)[] = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
];

/** Claude Code's project-dir rule: every char outside [A-Za-z0-9] becomes "-". */
export function sanitisePath(absPath: string): string {
  return absPath.replace(/[^A-Za-z0-9]/g, "-");
}

export function claudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

/** Transcript directory for a (realpath'd) working directory. */
export function sessionDir(realCwd: string, configDir = claudeConfigDir()): string {
  return join(configDir, "projects", sanitisePath(realCwd));
}

export function zeroTotals(): TokenTotals {
  return { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
}

export function addTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  const out = zeroTotals();
  for (const f of TOKEN_FIELDS) out[f] = a[f] + b[f];
  return out;
}

/**
 * Parse a transcript JSONL into one usage record per API message, in first-seen
 * order. Streamed messages repeat across lines (one per content block); the
 * LAST line per message id wins. Throws on malformed assistant lines.
 */
export function parseTranscript(text: string, file: string): MessageUsage[] {
  const byId = new Map<string, MessageUsage>();
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      throw new Error(`${file}:${i + 1}: invalid JSON (${(err as Error).message})`);
    }
    if (obj?.type !== "assistant" || !obj.message?.usage) return;
    const id: unknown = obj.message.id ?? obj.requestId;
    if (typeof id !== "string" || !id) {
      throw new Error(`${file}:${i + 1}: assistant line has neither message.id nor requestId`);
    }
    const usage = obj.message.usage;
    const rec: MessageUsage = { id, model: obj.message.model, ...zeroTotals() };
    for (const f of TOKEN_FIELDS) {
      if (typeof usage[f] !== "number") {
        throw new Error(`${file}:${i + 1}: usage.${f} missing or not a number`);
      }
      rec[f] = usage[f];
    }
    byId.set(id, rec); // Map keeps first-insertion order; later lines overwrite the value
  });
  return [...byId.values()];
}

export function sumMessages(messages: MessageUsage[]): TokenTotals {
  return messages.reduce<TokenTotals>((acc, m) => addTotals(acc, m), zeroTotals());
}

function breakdown(file: string, messages: MessageUsage[], meta: Record<string, unknown> = {}): AgentBreakdown {
  const models = [...new Set(messages.map((m) => m.model).filter((m): m is string => Boolean(m)))];
  return {
    file: basename(file),
    agentType: typeof meta.agentType === "string" ? meta.agentType : undefined,
    description: typeof meta.description === "string" ? meta.description : undefined,
    models,
    messages: messages.length,
    tokens: sumMessages(messages),
  };
}

async function readMeta(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`${path}: unreadable sub-agent meta (${(err as Error).message})`);
  }
}

async function listSubagentFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => /^agent-.+\.jsonl$/.test(f)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Token breakdown for a session: coordinator file plus every sub-agent file. */
export async function summariseSession(dir: string, sessionId: string): Promise<SessionBreakdown> {
  const mainFile = join(dir, `${sessionId}.jsonl`);
  const coordinatorMsgs = parseTranscript(await readFile(mainFile, "utf8"), mainFile);
  const coordinator = breakdown(mainFile, coordinatorMsgs);

  const subDir = join(dir, sessionId, "subagents");
  const subagents: AgentBreakdown[] = [];
  for (const f of await listSubagentFiles(subDir)) {
    const path = join(subDir, f);
    const meta = await readMeta(join(subDir, f.replace(/\.jsonl$/, ".meta.json")));
    subagents.push(breakdown(path, parseTranscript(await readFile(path, "utf8"), path), meta));
  }
  const total = subagents.reduce((acc, s) => addTotals(acc, s.tokens), coordinator.tokens);
  return { coordinator, subagents, total };
}

/** First API message of the main transcript (used for listing-size measurement). */
export async function firstMessageUsage(dir: string, sessionId: string): Promise<MessageUsage | undefined> {
  const mainFile = join(dir, `${sessionId}.jsonl`);
  return parseTranscript(await readFile(mainFile, "utf8"), mainFile)[0];
}

/** Copy the session's raw transcript files into dest. */
export async function copyTranscripts(dir: string, sessionId: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  await cp(join(dir, `${sessionId}.jsonl`), join(dest, `${sessionId}.jsonl`));
  const subDir = join(dir, sessionId);
  try {
    await cp(subDir, join(dest, sessionId), { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

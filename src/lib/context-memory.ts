import "server-only";

import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IGNORED_DIRECTORIES, isIgnoredFile, isTextPath } from "@/lib/workspace-file-policy";

// Context memory: a small, durable snapshot of what the project IS, so agents
// stop reading the same files and the same chat over and over. The snapshot is
// a plain JSON file per project — no database, no network.

export type SnapshotFile = { path: string; responsibility: string; lines: number };
export type SnapshotDependency = { from: string; to: string };

export type ContextSnapshot = {
  version: 1;
  projectRoot: string;
  updatedAt: string;
  stack: string[];
  architecture: string[];
  files: SnapshotFile[];
  dependencies: SnapshotDependency[];
  integrations: string[];
  decisions: string[];
  conflicts: Array<{ topic: string; previous: string; current: string; at: string }>;
  summary: string;
  stats: { scannedFiles: number; rawTokens: number; snapshotTokens: number; savedTokens: number };
};

const MAX_SCAN_FILES = 400;
const MAX_CONTENT_BYTES = 220_000;
const RESPONSIBILITY_RULES: Array<{ match: RegExp; label: string }> = [
  { match: /^src\/app\/api\//, label: "HTTP API (route handler)" },
  { match: /^src\/app\/(?!api\/)/, label: "страница / layout приложения" },
  { match: /^src\/components\//, label: "React-компонент интерфейса" },
  { match: /^src\/lib\//, label: "доменная логика" },
  { match: /^src\/db\//, label: "схема БД / доступ к данным" },
  { match: /^drizzle\//, label: "миграции и метаданные схемы" },
  { match: /^electron\//, label: "оболочка Electron (main / preload)" },
  { match: /^scripts\//, label: "сборочные и служебные скрипты" },
  { match: /^public\//, label: "статические файлы" },
  { match: /^docs?\//, label: "документация" },
  { match: /(^|\/)package\.json$/, label: "зависимости и команды" },
  { match: /\.test\.tsx?$/, label: "тесты" },
  { match: /^README/i, label: "описание проекта" },
];

const STACK_MARKERS: Array<{ file: string | RegExp; label: string }> = [
  { file: "next.config", label: "Next.js" },
  { file: "vite.config", label: "Vite" },
  { file: "tsconfig.json", label: "TypeScript" },
  { file: "tailwind.config", label: "Tailwind CSS" },
  { file: "drizzle.config", label: "Drizzle ORM" },
  { file: "electron-builder", label: "Electron Builder" },
  { file: "pubspec.yaml", label: "Flutter / Dart" },
  { file: "build.gradle", label: "Android / Gradle" },
  { file: "requirements.txt", label: "Python" },
  { file: "Cargo.toml", label: "Rust / Cargo" },
];

function snapshotPath(projectRoot: string) {
  const hash = createHash("sha1").update(projectRoot).digest("hex").slice(0, 16);
  return path.join(os.homedir(), ".multi-agent-studio", "context", `${hash}.json`);
}

export async function loadSnapshot(projectRoot: string): Promise<ContextSnapshot | null> {
  try {
    const raw = String(await readFile(snapshotPath(projectRoot), { encoding: "utf8" }));
    const parsed = JSON.parse(raw) as ContextSnapshot;
    if (parsed?.version !== 1 || parsed.projectRoot !== projectRoot) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSnapshot(snapshot: ContextSnapshot) {
  const target = snapshotPath(snapshot.projectRoot);
  await mkdir(path.dirname(target), { recursive: true });
  // Write to a temp file first so a crash never leaves a half-written snapshot.
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(snapshot, null, 2), "utf8");
  await writeFile(target, JSON.stringify(snapshot, null, 2), "utf8");
  return target;
}

async function walk(root: string, relativeDir = "", collected: string[] = []) {
  if (collected.length >= MAX_SCAN_FILES) return collected;
  let entries: Dirent[];
  try {
    entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });
  } catch {
    return collected;
  }
  for (const entry of entries) {
    if (collected.length >= MAX_SCAN_FILES) break;
    const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) continue;
      if (["release", "dist", "build", "coverage", "out"].includes(entry.name)) continue;
      await walk(root, relative, collected);
    } else if (entry.isFile() && !isIgnoredFile(relative)) {
      collected.push(relative);
    }
  }
  return collected;
}

export function responsibilityFor(relativePath: string) {
  const normalised = relativePath.replace(/\\/g, "/");
  for (const rule of RESPONSIBILITY_RULES) if (rule.match.test(normalised)) return rule.label;
  return "прочие файлы";
}

function detectStack(files: string[], packageJson: string) {
  const stack = new Set<string>();
  for (const marker of STACK_MARKERS) {
    const markerName = marker.file;
    if (markerName instanceof RegExp) {
      if (files.some((file) => markerName.test(file))) stack.add(marker.label);
    } else if (files.some((file) => file.toLowerCase().includes(markerName.toLowerCase()))) {
      stack.add(marker.label);
    }
  }
  try {
    const manifest = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
    if (deps.react) stack.add(`React ${deps.react.replace(/[\^~]/, "")}`);
    if (deps["next"]) stack.add(`Next.js ${deps["next"].replace(/[\^~]/, "")}`);
    if (deps.electron) stack.add("Electron");
    if (deps["better-sqlite3"] || deps["drizzle-orm"]) stack.add("SQLite + Drizzle");
    if (deps.tailwindcss) stack.add("Tailwind CSS");
    if (deps.vitest) stack.add("Vitest");
  } catch {
    /* package.json is optional */
  }
  return [...stack];
}

function detectIntegrations(sources: Array<{ path: string; content: string }>) {
  const integrations = new Set<string>();
  const patterns: Array<{ match: RegExp; label: string }> = [
    { match: /api\.openrouter\.ai/, label: "OpenRouter" },
    { match: /api\.openai\.com/, label: "OpenAI" },
    { match: /api\.anthropic\.com/, label: "Anthropic" },
    { match: /generativelanguage\.googleapis\.com/, label: "Google Gemini" },
    { match: /api\.telegram\.org/, label: "Telegram Bot API" },
    { match: /api\.github\.com/, label: "GitHub API" },
    { match: /127\.0\.0\.1:11434/, label: "Ollama (локально)" },
  ];
  for (const source of sources) {
    for (const pattern of patterns) if (pattern.match.test(source.content)) integrations.add(pattern.label);
  }
  return [...integrations];
}

// Imports are enough to draw the dependency map for the prompt: the agent sees
// which module pulls which, without opening a single file.
function detectDependencies(sources: Array<{ path: string; content: string }>) {
  const seen = new Set<string>();
  const result: SnapshotDependency[] = [];
  for (const source of sources) {
    const matches = source.content.matchAll(/(?:from\s+|require\()["']([^"']+)["']/g);
    for (const match of matches) {
      const target = match[1];
      if (!target.startsWith("@/") && !target.startsWith(".")) continue;
      const key = `${source.path}->${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ from: source.path, to: target });
      if (result.length >= 120) return result;
    }
  }
  return result;
}

// High-level only: decisions, blockers, release verdicts. Debug traces, stack
// traces and tool JSON never make it into the snapshot.
export function extractDecisions(messages: Array<{ role: string; content: string }>, limit = 12) {
  const decisions: string[] = [];
  const noise = /^\s*(?:\[tool|```|\{|\}|at\s+|\s*\d+%|PS [A-Z]:)/i;
  for (const message of messages) {
    if (message.role === "system") continue;
    const cleaned = message.content
      .replace(/\r/g, "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || cleaned.length < 12) continue;
    const sentences = cleaned.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (noise.test(sentence) || sentence.length < 12) continue;
      const worth = /(реш(ил|или|ено)|итог|вывод|договорились|план|правило|принцип|нельзя|нужно|требуется|стек|архитектур|блокер|blocker|release|готово|отказ)/i.test(sentence);
      if (!worth) continue;
      const line = sentence.slice(0, 200);
      if (!decisions.includes(line)) decisions.push(line);
      if (decisions.length >= limit) return decisions;
    }
  }
  return decisions;
}

export async function buildSnapshot(options: {
  projectRoot: string;
  messages?: Array<{ role: string; content: string }>;
  previous?: ContextSnapshot | null;
}): Promise<ContextSnapshot> {
  const { projectRoot, previous } = options;
  const files = await walk(projectRoot);
  const samples: Array<{ path: string; content: string }> = [];
  let scanned = 0;
  let rawTokens = 0;

  for (const relative of files) {
    if (!isTextPath(relative)) continue;
    if (scanned >= 220) break;
    try {
      const info = await stat(path.join(projectRoot, relative));
      if (info.size > MAX_CONTENT_BYTES) continue;
      const content = String(await readFile(path.join(projectRoot, relative), { encoding: "utf8" }));
      scanned += 1;
      rawTokens += Math.ceil(content.length / 4);
      samples.push({ path: relative, content });
    } catch {
      /* unreadable files are simply skipped */
    }
  }

  const packageJson = samples.find((sample) => sample.path.endsWith("package.json"))?.content ?? "";
  const stack = detectStack(files, packageJson);
  const integrations = detectIntegrations(samples);
  const dependencies = detectDependencies(samples);

  // Key files: entry points, API routes, the runner, the schema and the biggest
  // components. Responsibility comes from the path, lines from the content.
  const keyFiles: SnapshotFile[] = samples
    .filter((sample) => /\.(tsx?|jsx?|css|sql|md|json)$/.test(sample.path))
    .map((sample) => ({
      path: sample.path,
      responsibility: responsibilityFor(sample.path),
      lines: sample.content.split(/\r?\n/).length,
    }))
    .filter((file) => /^(src|electron|drizzle|scripts)\//.test(file.path) || file.path.endsWith("package.json"))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 40);

  const architecture = previous?.architecture?.slice(0, 20) ?? [];
  const decisions = options.messages?.length ? extractDecisions(options.messages) : previous?.decisions ?? [];
  const summary = options.messages?.length
    ? decisions.slice(0, 8).join(" · ").slice(0, 1200)
    : previous?.summary ?? "";

  const snapshotTokens = Math.ceil(
    (JSON.stringify({ stack, integrations, keyFiles, dependencies, decisions })).length / 4,
  );

  const snapshot: ContextSnapshot = {
    version: 1,
    projectRoot,
    updatedAt: new Date().toISOString(),
    stack,
    architecture,
    files: keyFiles,
    dependencies,
    integrations,
    decisions,
    conflicts: previous?.conflicts ?? [],
    summary,
    stats: {
      scannedFiles: scanned,
      rawTokens,
      snapshotTokens,
      savedTokens: Math.max(0, rawTokens - snapshotTokens),
    },
  };

  // Conflict rule: the freshest dialogue wins. A decision that replaces an old
  // one is recorded so nothing silently disappears.
  if (previous) {
    for (const decision of decisions) {
      const clash = previous.decisions.find((old) =>
        old !== decision && old.slice(0, 40).toLowerCase() === decision.slice(0, 40).toLowerCase(),
      );
      if (clash) {
        snapshot.conflicts.push({
          topic: decision.slice(0, 60),
          previous: clash,
          current: decision,
          at: new Date().toISOString(),
        });
      }
    }
    snapshot.conflicts = snapshot.conflicts.slice(-20);
  }

  return snapshot;
}

// Everything the agent needs, in a size the prompt can afford.
export function renderSnapshot(snapshot: ContextSnapshot, maxChars = 4000) {
  const lines: string[] = [];
  lines.push("=== PROJECT CONTEXT SNAPSHOT (durable memory) ===");
  lines.push(`updated: ${snapshot.updatedAt}`);
  if (snapshot.stack.length) lines.push(`stack: ${snapshot.stack.join(", ")}`);
  if (snapshot.integrations.length) lines.push(`integrations: ${snapshot.integrations.join(", ")}`);
  if (snapshot.architecture.length) lines.push(`architecture rules: ${snapshot.architecture.join(" | ")}`);
  if (snapshot.files.length) {
    lines.push("key files:");
    for (const file of snapshot.files.slice(0, 18)) lines.push(`  - ${file.path} — ${file.responsibility} (${file.lines} строк)`);
  }
  if (snapshot.dependencies.length) {
    const grouped = snapshot.dependencies.slice(0, 16).map((dep) => `${dep.from} → ${dep.to}`);
    lines.push(`dependencies: ${grouped.join("; ")}`);
  }
  if (snapshot.decisions.length) {
    lines.push("decisions (newest wins):");
    for (const decision of snapshot.decisions.slice(0, 8)) lines.push(`  - ${decision}`);
  }
  if (snapshot.conflicts.length) {
    const last = snapshot.conflicts.slice(-3).map((conflict) => `${conflict.topic}: «${conflict.previous}» → «${conflict.current}»`);
    lines.push(`resolved conflicts: ${last.join(" | ")}`);
  }
  lines.push("Use this snapshot instead of re-reading the project. If the current dialogue contradicts it, follow the dialogue and update the snapshot.");
  lines.push("=== END SNAPSHOT ===");
  return lines.join("\n").slice(0, maxChars);
}

export function snapshotTokenEstimate(snapshot: ContextSnapshot) {
  return Math.ceil(renderSnapshot(snapshot).length / 4);
}

// A small in-process cache: the snapshot is read once per minute instead of
// on every agent call, and a stale snapshot is rebuilt in the background.
const cache = new Map<string, { at: number; snapshot: ContextSnapshot | null }>();
const CACHE_TTL_MS = 60_000;

export async function getSnapshotCached(projectRoot: string) {
  const hit = cache.get(projectRoot);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.snapshot;
  const snapshot = await loadSnapshot(projectRoot);
  cache.set(projectRoot, { at: Date.now(), snapshot });
  return snapshot;
}

export function invalidateSnapshotCache(projectRoot?: string) {
  if (projectRoot) cache.delete(projectRoot);
  else cache.clear();
}

// Rebuild in the background: the user never waits for the scan, and the next
// round already sees the fresh snapshot.
export async function refreshSnapshotInBackground(options: {
  projectRoot: string;
  messages: Array<{ role: string; content: string }>;
}) {
  try {
    const previous = await loadSnapshot(options.projectRoot);
    const snapshot = await buildSnapshot({ ...options, previous });
    await saveSnapshot(snapshot);
    cache.set(options.projectRoot, { at: Date.now(), snapshot });
    return snapshot;
  } catch {
    return null;
  }
}

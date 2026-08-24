import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, realpath, stat, lstat, mkdir, writeFile, unlink, rename, rm } from "node:fs/promises";
import path from "node:path";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, projectFiles, workspaceFileHistory, workspaceSettings } from "@/db/schema";
import { ensureWorkspaceBootstrap } from "@/lib/workspace";
import { assertRelativePath, compact, resolveWithinRoot, toPosix } from "@/lib/workspace-paths";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PATCH_BYTES = 8 * 1024 * 1024;
const MAX_TREE_FILES = 10_000;
const MAX_SEARCH_RESULTS = 200;
const IGNORED_DIRECTORIES = new Set([".git", ".multi-agent-backups", "node_modules", ".next", "dist", "build", "coverage", ".cache"]);
const VIRTUAL_DIRECTORY_PREFIX = ".multi-agent-virtual-dirs/";
const TEXT_EXTENSIONS = new Set([
  "cjs", "css", "csv", "go", "html", "java", "js", "json", "jsx", "kt", "md", "mjs", "py", "rb", "rs", "sql", "ts", "tsx", "txt", "xml", "yaml", "yml",
]);

type RootSettings = { projectRoot: string };

type WorkspaceFileState = {
  exists: boolean;
  content: string;
};

export type WorkspaceTreeFile = {
  path: string;
  language: string;
  size: number;
  updatedAt: string;
};

export type WorkspaceTreeEntry = WorkspaceTreeFile & {
  kind: "file" | "directory";
};

export type WorkspacePatchFile = {
  path: string;
  operation: "create" | "modify" | "delete";
  content?: string;
  expectedHash?: string;
};

function languageFromPath(filePath: string) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "json"].includes(extension)) return extension;
  return extension || "plaintext";
}

function isIgnoredFile(filePath: string) {
  const name = path.basename(filePath).toLowerCase();
  return name.startsWith(".env") || name === "dev.db" || name.endsWith(".pem") || name.endsWith(".key") || name.endsWith(".p12");
}

function isTextPath(filePath: string) {
  if (isIgnoredFile(filePath)) return false;
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) || !extension;
}

async function getRootSettings(): Promise<RootSettings> {
  await ensureWorkspaceBootstrap();
  const [settings] = await db.select({ projectRoot: workspaceSettings.projectRoot }).from(workspaceSettings).limit(1);
  if (!settings?.projectRoot) throw new Error("Connect a project directory first");
  return settings;
}

export async function getWorkspaceRoot() {
  return (await getRootSettings()).projectRoot;
}

async function assertNoSymlinkBetween(root: string, candidate: string) {
  let current = candidate;
  while (true) {
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) throw new Error("Symbolic links are not allowed inside the workspace");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Workspace path escaped root");
    current = parent;
  }
}

async function safeAbsolutePath(root: string, relativePath: string) {
  const resolved = resolveWithinRoot(root, relativePath);
  await assertNoSymlinkBetween(root, resolved.absolutePath);
  return resolved;
}

async function readTextState(root: string, relativePath: string): Promise<WorkspaceFileState> {
  const { absolutePath } = await safeAbsolutePath(root, relativePath);
  try {
    const info = await stat(absolutePath);
    if (!info.isFile()) throw new Error("Workspace path is not a file");
    if (info.size > MAX_FILE_BYTES) throw new Error("File is too large for the workspace editor");
    const content = await readFile(absolutePath, "utf8");
    if (content.includes("\0")) throw new Error("Binary files cannot be edited as text");
    return { exists: true, content };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, content: "" };
    throw error;
  }
}

async function walkDirectory(root: string, current: string, files: WorkspaceTreeFile[], entries: WorkspaceTreeEntry[]) {
  if (files.length >= MAX_TREE_FILES) return;
  const directoryEntries = await readdir(current, { withFileTypes: true });

  for (const entry of directoryEntries) {
    if (files.length >= MAX_TREE_FILES) return;
    if (entry.name.startsWith(".") && IGNORED_DIRECTORIES.has(entry.name)) continue;

    const absolutePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const info = await stat(absolutePath);
      const relativePath = toPosix(path.relative(root, absolutePath));
      entries.push({ path: relativePath, language: "directory", size: 0, updatedAt: info.mtime.toISOString(), kind: "directory" });
      await walkDirectory(root, absolutePath, files, entries);
      continue;
    }
    if (!entry.isFile() || isIgnoredFile(absolutePath)) continue;

    const info = await stat(absolutePath);
    const relativePath = toPosix(path.relative(root, absolutePath));
    const file = { path: relativePath, language: languageFromPath(relativePath), size: info.size, updatedAt: info.mtime.toISOString() };
    files.push(file);
    entries.push({ ...file, kind: "file" });
  }
}

async function scanTree(root: string) {
  const files: WorkspaceTreeFile[] = [];
  const entries: WorkspaceTreeEntry[] = [];
  await walkDirectory(root, root, files, entries);
  const sortEntries = (left: WorkspaceTreeEntry, right: WorkspaceTreeEntry) => left.path.localeCompare(right.path);
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
    entries: entries.sort(sortEntries),
  };
}

function isNoWorkspaceRoot(error: unknown) {
  return error instanceof Error && error.message === "Connect a project directory first";
}

async function scanVirtualTree() {
  const rows = await db.select().from(projectFiles).orderBy(asc(projectFiles.path));
  const files: WorkspaceTreeFile[] = [];
  const entries = new Map<string, WorkspaceTreeEntry>();
  const addDirectory = (directoryPath: string, updatedAt: Date) => {
    if (!directoryPath || entries.has(directoryPath)) return;
    entries.set(directoryPath, { path: directoryPath, language: "directory", size: 0, updatedAt: updatedAt.toISOString(), kind: "directory" });
    const parent = directoryPath.split("/").slice(0, -1).join("/");
    if (parent) addDirectory(parent, updatedAt);
  };

  for (const row of rows) {
    if (row.path.startsWith(VIRTUAL_DIRECTORY_PREFIX)) {
      addDirectory(row.path.slice(VIRTUAL_DIRECTORY_PREFIX.length), row.updatedAt);
      continue;
    }
    const file = { path: row.path, language: row.language, size: Buffer.byteLength(row.content, "utf8"), updatedAt: row.updatedAt.toISOString() };
    files.push(file);
    entries.set(row.path, { ...file, kind: "file" });
    const parent = row.path.split("/").slice(0, -1).join("/");
    if (parent) addDirectory(parent, row.updatedAt);
  }

  return {
    files,
    entries: [...entries.values()].sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export async function connectWorkspaceDirectory(directory: string) {
  const requested = compact(directory);
  if (!requested) throw new Error("Project directory is required");
  const resolved = await realpath(path.resolve(requested));
  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error("Selected project path is not a directory");

  const tree = await scanTree(resolved);
  const virtualRows = await db.select().from(projectFiles);
  const [currentSettings] = await db.select({ projectRoot: workspaceSettings.projectRoot }).from(workspaceSettings).limit(1);
  const previousRoot = currentSettings?.projectRoot ?? "";
  await db.update(workspaceSettings).set({ projectRoot: resolved, updatedAt: new Date() });

  // A folder switch starts a new workspace index; never leak files from the old root.
  // Only a root-less virtual workspace may be materialized into the first physical folder.
  if (!previousRoot) {
    for (const row of virtualRows) {
      if (row.path.startsWith(VIRTUAL_DIRECTORY_PREFIX) || row.language === "directory") continue;
      const target = await safeAbsolutePath(resolved, row.path);
      try {
        await lstat(target.absolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await mkdir(path.dirname(target.absolutePath), { recursive: true });
        await writeFile(target.absolutePath, row.content, { encoding: "utf8", flag: "wx" });
      }
    }
  }

  await db.delete(projectFiles);
  const connectedTree = await scanTree(resolved);
  await db.delete(projectFiles);

  let imported = 0;
  for (const file of connectedTree.files) {
    if (!isTextPath(file.path) || file.size > MAX_FILE_BYTES) continue;
    const state = await readTextState(resolved, file.path);
    if (!state.exists) continue;
    await db.insert(projectFiles).values({
      path: file.path,
      language: file.language,
      content: state.content,
      updatedAt: new Date(file.updatedAt),
    });
    imported += 1;
  }

  return { root: resolved, files: tree.files.length, imported };
}

export async function listWorkspaceTree() {
  try {
    const root = await getWorkspaceRoot();
    return { root, ...(await scanTree(root)) };
  } catch (error) {
    if (!isNoWorkspaceRoot(error)) throw error;
    return { root: "", ...(await scanVirtualTree()) };
  }
}

async function assertMainWorkspaceActor(actorAgentId: number) {
  await assertMainAgent(actorAgentId);
}

export async function createWorkspaceEntry(actorAgentId: number, relativePath: string, kind: "file" | "directory", content = "") {
  await assertMainWorkspaceActor(actorAgentId);
  let root: string;
  try {
    root = await getWorkspaceRoot();
  } catch (error) {
    if (!isNoWorkspaceRoot(error)) throw error;
    const safePath = assertRelativePath(relativePath);
    const virtualPath = kind === "directory" ? `${VIRTUAL_DIRECTORY_PREFIX}${safePath}` : safePath;
    await db.insert(projectFiles).values({ path: virtualPath, language: kind === "directory" ? "directory" : languageFromPath(safePath), content: kind === "directory" ? "" : content, updatedAt: new Date() });
    return { path: safePath, kind };
  }

  const target = await safeAbsolutePath(root, relativePath);
  if (kind === "directory") {
    await mkdir(target.absolutePath, { recursive: true });
  } else {
    await mkdir(path.dirname(target.absolutePath), { recursive: true });
    await writeFile(target.absolutePath, content, { encoding: "utf8", flag: "wx" });
    await db.insert(projectFiles).values({ path: target.relativePath, language: languageFromPath(target.relativePath), content, updatedAt: new Date() });
  }
  return { path: target.relativePath, kind };
}

export async function renameWorkspaceEntry(actorAgentId: number, relativePath: string, nextRelativePath: string) {
  await assertMainWorkspaceActor(actorAgentId);
  let root: string;
  try {
    root = await getWorkspaceRoot();
  } catch (error) {
    if (!isNoWorkspaceRoot(error)) throw error;
    const sourcePath = assertRelativePath(relativePath);
    const targetPath = assertRelativePath(nextRelativePath);
    const rows = await db.select().from(projectFiles);
    const sourceMarker = `${VIRTUAL_DIRECTORY_PREFIX}${sourcePath}`;
    const affected = rows.filter((row) => row.path === sourcePath || row.path === sourceMarker || row.path.startsWith(`${sourcePath}/`));
    if (affected.length === 0) throw new Error("Workspace path not found");
    if (rows.some((row) => row.path === targetPath || row.path === `${VIRTUAL_DIRECTORY_PREFIX}${targetPath}` || row.path.startsWith(`${targetPath}/`))) throw new Error("Target path already exists");
    for (const row of affected) {
      const nextPath = row.path === sourceMarker ? `${VIRTUAL_DIRECTORY_PREFIX}${targetPath}` : row.path === sourcePath ? targetPath : `${targetPath}/${row.path.slice(`${sourcePath}/`.length)}`;
      await db.delete(projectFiles).where(eq(projectFiles.path, row.path));
      await db.insert(projectFiles).values({ path: nextPath, language: row.language, content: row.content, updatedAt: new Date() });
    }
    return { path: sourcePath, nextPath: targetPath };
  }

  const source = await safeAbsolutePath(root, relativePath);
  const target = await safeAbsolutePath(root, nextRelativePath);
  try {
    await lstat(target.absolutePath);
    throw new Error("Target path already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await mkdir(path.dirname(target.absolutePath), { recursive: true });
  await rename(source.absolutePath, target.absolutePath);
  const indexedFiles = await db.select().from(projectFiles);
  const prefix = `${source.relativePath}/`;
  const affected = indexedFiles.filter((file) => file.path === source.relativePath || file.path.startsWith(prefix));
  for (const file of affected) {
    const nextPath = file.path === source.relativePath ? target.relativePath : `${target.relativePath}/${file.path.slice(prefix.length)}`;
    await db.delete(projectFiles).where(eq(projectFiles.path, file.path));
    await db.insert(projectFiles).values({ path: nextPath, language: languageFromPath(nextPath), content: file.content, updatedAt: new Date() });
  }
  return { path: source.relativePath, nextPath: target.relativePath };
}

export async function deleteWorkspaceEntry(actorAgentId: number, relativePath: string) {
  await assertMainWorkspaceActor(actorAgentId);
  let root: string;
  try {
    root = await getWorkspaceRoot();
  } catch (error) {
    if (!isNoWorkspaceRoot(error)) throw error;
    const targetPath = assertRelativePath(relativePath);
    const rows = await db.select().from(projectFiles);
    const marker = `${VIRTUAL_DIRECTORY_PREFIX}${targetPath}`;
    const affected = rows.filter((row) => row.path === targetPath || row.path === marker || row.path.startsWith(`${targetPath}/`));
    if (affected.length === 0) throw new Error("Workspace path not found");
    for (const row of affected) await db.delete(projectFiles).where(eq(projectFiles.path, row.path));
    return { path: targetPath };
  }

  const target = await safeAbsolutePath(root, relativePath);
  const info = await lstat(target.absolutePath);
  await rm(target.absolutePath, { recursive: info.isDirectory(), force: false });
  const indexedFiles = await db.select().from(projectFiles);
  const prefix = `${target.relativePath}/`;
  for (const file of indexedFiles) {
    if (file.path === target.relativePath || (info.isDirectory() && file.path.startsWith(prefix))) {
      await db.delete(projectFiles).where(eq(projectFiles.path, file.path));
    }
  }
  return { path: target.relativePath };
}

export async function readWorkspaceFile(relativePath: string) {
  try {
    const root = await getWorkspaceRoot();
    const state = await readTextState(root, relativePath);
    if (!state.exists) throw new Error("Workspace file not found");
    return { path: assertRelativePath(relativePath), content: state.content };
  } catch (error) {
    if (!isNoWorkspaceRoot(error)) throw error;
    const safePath = assertRelativePath(relativePath);
    const [file] = await db.select().from(projectFiles).where(eq(projectFiles.path, safePath)).limit(1);
    if (!file) throw new Error("Workspace file not found");
    return { path: safePath, content: file.content };
  }
}

export async function searchWorkspaceFiles(query: string) {
  const needle = compact(query);
  if (!needle) throw new Error("Search query is required");
  if (needle.length > 500) throw new Error("Search query is too long");

  let root: string;
  try {
    root = await getWorkspaceRoot();
  } catch (error) {
    if (!isNoWorkspaceRoot(error)) throw error;
    const files = (await db.select().from(projectFiles)).filter((row) => !row.path.startsWith(VIRTUAL_DIRECTORY_PREFIX) && row.language !== "directory");
    const matches: Array<{ path: string; line: number; text: string }> = [];
    for (const file of files) {
      file.content.split("\n").forEach((line, index) => {
        if (matches.length < MAX_SEARCH_RESULTS && line.toLowerCase().includes(needle.toLowerCase())) matches.push({ path: file.path, line: index + 1, text: line.slice(0, 500) });
      });
    }
    return matches;
  }
  const tree = await scanTree(root);
  const matches: Array<{ path: string; line: number; text: string }> = [];

  for (const file of tree.files) {
    if (matches.length >= MAX_SEARCH_RESULTS || !isTextPath(file.path) || file.size > MAX_FILE_BYTES) continue;
    const state = await readTextState(root, file.path);
    if (!state.exists) continue;
    state.content.split("\n").forEach((line, index) => {
      if (matches.length < MAX_SEARCH_RESULTS && line.toLowerCase().includes(needle.toLowerCase())) {
        matches.push({ path: file.path, line: index + 1, text: line.slice(0, 500) });
      }
    });
  }

  return matches;
}

function hashContent(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function assertMainAgent(actorAgentId: number) {
  const [actor] = await db.select({ id: agents.id, role: agents.role }).from(agents).where(eq(agents.id, actorAgentId)).limit(1);
  if (!actor) throw new Error("Agent not found");
  if (actor.role !== "main") throw new Error("Only the Main Agent can modify workspace files");
}

async function writeBackup(root: string, relativePath: string, content: string) {
  const backupRelative = `.multi-agent-backups/${Date.now()}-${randomUUID()}.bak`;
  const backupAbsolute = path.resolve(root, ...backupRelative.split("/"));
  await mkdir(path.dirname(backupAbsolute), { recursive: true });
  await writeFile(backupAbsolute, content, "utf8");
  return backupRelative;
}

export async function applyWorkspacePatch(actorAgentId: number, patch: WorkspacePatchFile[]) {
  await assertMainAgent(actorAgentId);
  const root = await getWorkspaceRoot();
  if (!Array.isArray(patch) || patch.length === 0) throw new Error("Patch must contain at least one file");
  if (JSON.stringify(patch).length > MAX_PATCH_BYTES) throw new Error("Patch is too large");

  const seen = new Set<string>();
  const prepared = [] as Array<WorkspacePatchFile & { relativePath: string; absolutePath: string; previous: WorkspaceFileState }>;
  for (const item of patch) {
    if (!item || !["create", "modify", "delete"].includes(item.operation)) throw new Error("Invalid patch operation");
    const target = await safeAbsolutePath(root, item.path);
    if (seen.has(target.relativePath)) throw new Error(`Duplicate patch path: ${target.relativePath}`);
    seen.add(target.relativePath);
    const previous = await readTextState(root, target.relativePath);
    if (item.operation === "create" && previous.exists) throw new Error(`File already exists: ${target.relativePath}`);
    if (item.operation !== "create" && !previous.exists) throw new Error(`File does not exist: ${target.relativePath}`);
    if (item.operation !== "delete" && typeof item.content !== "string") throw new Error(`Content is required for ${target.relativePath}`);
    if (item.expectedHash && previous.exists && item.expectedHash !== hashContent(previous.content)) throw new Error(`File changed since patch was prepared: ${target.relativePath}`);
    prepared.push({ ...item, relativePath: target.relativePath, absolutePath: target.absolutePath, previous });
  }

  const applied: number[] = [];
  try {
    for (const item of prepared) {
      const backupPath = item.previous.exists ? await writeBackup(root, item.relativePath, item.previous.content) : "";
      if (item.operation === "delete") await unlink(item.absolutePath);
      else {
        await mkdir(path.dirname(item.absolutePath), { recursive: true });
        await writeFile(item.absolutePath, item.content ?? "", { encoding: "utf8", flag: item.operation === "create" ? "wx" : "w" });
      }

      const [history] = await db.insert(workspaceFileHistory).values({
        filePath: item.relativePath,
        previousContent: item.previous.content,
        operation: item.operation,
        backupPath,
        actorAgentId,
      }).returning({ id: workspaceFileHistory.id });
      applied.push(history.id);

      if (item.operation === "delete") await db.delete(projectFiles).where(eq(projectFiles.path, item.relativePath));
      else await db.insert(projectFiles).values({ path: item.relativePath, language: languageFromPath(item.relativePath), content: item.content ?? "", updatedAt: new Date() }).onConflictDoUpdate({ target: projectFiles.path, set: { content: item.content ?? "", language: languageFromPath(item.relativePath), updatedAt: new Date() } });
    }
  } catch (error) {
    throw new Error(`Patch failed after ${applied.length} file(s): ${error instanceof Error ? error.message : "unknown error"}`);
  }

  return { applied: prepared.map((item) => item.relativePath), historyIds: applied };
}

export async function rollbackWorkspaceFile(actorAgentId: number, relativePath: string) {
  await assertMainAgent(actorAgentId);
  const root = await getWorkspaceRoot();
  const safePath = assertRelativePath(relativePath);
  const [history] = await db.select().from(workspaceFileHistory).where(eq(workspaceFileHistory.filePath, safePath)).orderBy(desc(workspaceFileHistory.id)).limit(1);
  if (!history) throw new Error("No workspace history found for this file");
  const { absolutePath } = await safeAbsolutePath(root, safePath);

  if (history.operation === "create") await unlink(absolutePath).catch((error) => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
  else {
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, history.previousContent, "utf8");
  }

  if (history.operation === "create") await db.delete(projectFiles).where(eq(projectFiles.path, safePath));
  else await db.insert(projectFiles).values({ path: safePath, language: languageFromPath(safePath), content: history.previousContent, updatedAt: new Date() }).onConflictDoUpdate({ target: projectFiles.path, set: { content: history.previousContent, updatedAt: new Date() } });
  await db.delete(workspaceFileHistory).where(eq(workspaceFileHistory.id, history.id));
  return { path: safePath, restoredHistoryId: history.id };
}

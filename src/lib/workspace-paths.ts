import path from "node:path";

export function compact(value: string | undefined) {
  return (value ?? "").trim();
}

export function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

export function assertRelativePath(relativePath: string) {
  const raw = compact(relativePath).replaceAll("\\", "/");
  if (!raw || raw.includes("\0")) throw new Error("Workspace path is required");
  if (raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) throw new Error("Absolute paths are not allowed");
  if (raw.split("/").some((part) => part === "..")) throw new Error("Parent path '..' is not allowed");
  if (raw.split("/").some((part) => part === ".")) throw new Error("Current-directory path segments are not allowed");
  return raw;
}

export function resolveWithinRoot(root: string, relativePath: string) {
  const safeRelative = assertRelativePath(relativePath);
  const candidate = path.resolve(root, ...safeRelative.split("/"));
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Workspace path is outside the selected root");
  }
  return { relativePath: safeRelative, absolutePath: candidate };
}

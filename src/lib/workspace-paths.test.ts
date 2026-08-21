import { describe, expect, it } from "vitest";
import path from "node:path";
import { assertRelativePath, resolveWithinRoot } from "@/lib/workspace-paths";

describe("assertRelativePath", () => {
  it("returns a trimmed relative path", () => {
    expect(assertRelativePath("  src/foo.ts  ")).toBe("src/foo.ts");
  });

  it("normalizes backslashes to forward slashes", () => {
    expect(assertRelativePath("src\\foo.ts")).toBe("src/foo.ts");
  });

  it("rejects an empty or whitespace-only path", () => {
    expect(() => assertRelativePath("")).toThrow("Workspace path is required");
    expect(() => assertRelativePath("   ")).toThrow("Workspace path is required");
  });

  it("rejects null bytes", () => {
    expect(() => assertRelativePath("src/a\0b.ts")).toThrow("Workspace path is required");
  });

  it("rejects a POSIX absolute path", () => {
    expect(() => assertRelativePath("/etc/passwd")).toThrow("Absolute paths are not allowed");
  });

  it("rejects a Windows absolute path", () => {
    expect(() => assertRelativePath("C:\\Users\\secret.txt")).toThrow("Absolute paths are not allowed");
    expect(() => assertRelativePath("C:/Users/secret.txt")).toThrow("Absolute paths are not allowed");
  });

  it("rejects parent-directory traversal", () => {
    expect(() => assertRelativePath("../secret.txt")).toThrow("Parent path '..' is not allowed");
    expect(() => assertRelativePath("src/../../secret.txt")).toThrow("Parent path '..' is not allowed");
  });

  it("rejects current-directory segments", () => {
    expect(() => assertRelativePath("./secret.txt")).toThrow("Current-directory path segments are not allowed");
    expect(() => assertRelativePath("src/./secret.txt")).toThrow("Current-directory path segments are not allowed");
  });
});

describe("resolveWithinRoot", () => {
  const root = process.platform === "win32" ? "C:\\workspace" : "/workspace";

  it("resolves a relative path inside the root", () => {
    const resolved = resolveWithinRoot(root, "src/foo.ts");
    expect(resolved.relativePath).toBe("src/foo.ts");
    expect(resolved.absolutePath).toBe(path.resolve(root, "src", "foo.ts"));
  });

  it("resolves nested paths without escaping", () => {
    const resolved = resolveWithinRoot(root, "a/b/c.txt");
    expect(resolved.absolutePath).toBe(path.resolve(root, "a", "b", "c.txt"));
  });

  it("rejects traversal attempts", () => {
    expect(() => resolveWithinRoot(root, "../etc/passwd")).toThrow();
    expect(() => resolveWithinRoot(root, "..\\etc\\passwd")).toThrow();
  });

  it("rejects absolute paths", () => {
    expect(() => resolveWithinRoot(root, "/etc/passwd")).toThrow("Absolute paths are not allowed");
  });
});

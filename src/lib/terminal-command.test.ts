import { describe, expect, it } from "vitest";
import { assertSafeArgument, parseCommand, tokenize } from "@/lib/terminal-command";

const isWindows = process.platform === "win32";

describe("tokenize", () => {
  it("splits a simple command into tokens", () => {
    expect(tokenize("npm run test")).toEqual(["npm", "run", "test"]);
  });

  it("honors double-quoted arguments", () => {
    expect(tokenize('npm run "my script"')).toEqual(["npm", "run", "my script"]);
  });

  it("honors single-quoted arguments", () => {
    expect(tokenize("npx eslint 'src/**/*.ts'")).toEqual(["npx", "eslint", "src/**/*.ts"]);
  });

  it("rejects an empty command", () => {
    expect(() => tokenize("   ")).toThrow("Command is required");
  });

  it("rejects an overlong command", () => {
    expect(() => tokenize(`npm run ${"x".repeat(2_100)}`)).toThrow("Command is too long");
  });

  it("rejects parent-path traversal", () => {
    expect(() => tokenize("npm run ../evil")).toThrow("Parent path '..' is not allowed");
  });

  it.each([";", "&&", "|", "`", "$(ls)", "${PATH}", "cmd /c", "powershell", "bash -c"])(
    "rejects shell operators and nested shells: %s",
    (fragment) => {
      expect(() => tokenize(`npm run ${fragment}`)).toThrow(/Shell operators and nested shells are not allowed/);
    },
  );
});

describe("assertSafeArgument", () => {
  it("allows a relative path", () => {
    expect(() => assertSafeArgument("src/index.ts")).not.toThrow();
  });

  it("rejects parent-path traversal", () => {
    expect(() => assertSafeArgument("../etc/passwd")).toThrow("Unsafe path argument");
  });

  it("rejects null bytes", () => {
    expect(() => assertSafeArgument("a\0b")).toThrow("Unsafe path argument");
  });

  it("rejects a POSIX absolute path", () => {
    expect(() => assertSafeArgument("/etc/passwd")).toThrow("Absolute paths are not allowed");
  });

  it("rejects a Windows absolute path", () => {
    expect(() => assertSafeArgument("C:\\Windows\\system32")).toThrow("Absolute paths are not allowed");
  });

  it("rejects changing the terminal root via --cwd", () => {
    expect(() => assertSafeArgument("--cwd=/tmp")).toThrow("Changing the terminal root is not allowed");
  });

  it("rejects changing the terminal root via --prefix", () => {
    expect(() => assertSafeArgument("--prefix")).toThrow("Changing the terminal root is not allowed");
  });
});

describe("parseCommand", () => {
  it("parses an allowed command and picks the platform executable", () => {
    const parsed = parseCommand("npm run test");
    expect(parsed.name).toBe("npm");
    expect(parsed.executable).toBe(isWindows ? "npm.cmd" : "npm");
    expect(parsed.args).toEqual(["run", "test"]);
  });

  it("parses npx with a tool subcommand", () => {
    const parsed = parseCommand("npx tsc --noEmit");
    expect(parsed.name).toBe("npx");
    expect(parsed.args).toEqual(["tsc", "--noEmit"]);
  });

  it("allows read-only git inspection", () => {
    const parsed = parseCommand("git status");
    expect(parsed.name).toBe("git");
    expect(parsed.args).toEqual(["status"]);
  });

  it("allows a relative node script for preview", () => {
    const parsed = parseCommand("node src/index.js");
    expect(parsed.name).toBe("node");
    expect(parsed.args).toEqual(["src/index.js"]);
  });

  it("rejects a command outside the allow-list", () => {
    expect(() => parseCommand("rm -rf /")).toThrow("Command is not allowed: rm");
  });

  it("rejects a disallowed subcommand", () => {
    expect(() => parseCommand("npm install")).toThrow("Command is not allowed: npm install");
  });

  it("rejects an absolute path argument", () => {
    expect(() => parseCommand("git status C:\\foo")).toThrow("Absolute paths are not allowed");
  });

  it("normalizes an explicit .exe executable suffix", () => {
    const parsed = parseCommand("npm.exe run test");
    expect(parsed.name).toBe("npm");
    expect(parsed.args).toEqual(["run", "test"]);
  });
});

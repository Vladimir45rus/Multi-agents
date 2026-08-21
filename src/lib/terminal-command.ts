type CommandPolicy = {
  executable: string;
  subcommands: Set<string>;
};

export const COMMAND_POLICIES: Record<string, CommandPolicy> = {
  npm: { executable: process.platform === "win32" ? "npm.cmd" : "npm", subcommands: new Set(["run", "test", "exec", "--version", "--help"]) },
  npx: { executable: process.platform === "win32" ? "npx.cmd" : "npx", subcommands: new Set(["tsc", "eslint", "next", "vitest", "jest", "prettier"]) },
  pnpm: { executable: process.platform === "win32" ? "pnpm.cmd" : "pnpm", subcommands: new Set(["run", "test", "exec", "--version", "--help"]) },
  yarn: { executable: process.platform === "win32" ? "yarn.cmd" : "yarn", subcommands: new Set(["run", "test", "--version", "--help"]) },
  bun: { executable: process.platform === "win32" ? "bun.exe" : "bun", subcommands: new Set(["run", "test", "x", "--version", "--help"]) },
  git: { executable: process.platform === "win32" ? "git.exe" : "git", subcommands: new Set(["status", "diff", "log", "branch", "show", "rev-parse", "ls-files"]) },
  python: { executable: process.platform === "win32" ? "python.exe" : "python3", subcommands: new Set(["-m", "--version"]) },
  pytest: { executable: process.platform === "win32" ? "pytest.exe" : "pytest", subcommands: new Set(["--version", "-q", "-x"]) },
  go: { executable: process.platform === "win32" ? "go.exe" : "go", subcommands: new Set(["test", "build", "vet", "version"]) },
  cargo: { executable: process.platform === "win32" ? "cargo.exe" : "cargo", subcommands: new Set(["test", "check", "build", "fmt", "--version"]) },
};

export function tokenize(command: string) {
  const input = command.trim();
  if (!input) throw new Error("Command is required");
  if (input.length > 2_000) throw new Error("Command is too long");
  if (input.includes("..")) throw new Error("Parent path '..' is not allowed");
  if (/[;&|<>`\n\r]|\$\(|\$\{|\b(?:cmd|powershell|pwsh|bash|sh)\b/i.test(input)) {
    throw new Error("Shell operators and nested shells are not allowed");
  }

  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input))) tokens.push(match[1] ?? match[2] ?? match[3]);
  if (!tokens.length) throw new Error("Command is required");

  // Ensure the tokenizer consumed the entire input; leftover content means the
  // command syntax was malformed (e.g. unbalanced quotes).
  pattern.lastIndex = 0;
  if (input.replace(pattern, "").trim().length > 0) throw new Error("Invalid command syntax");
  return tokens;
}

export function assertSafeArgument(argument: string) {
  if (argument.includes("..") || argument.includes("\0")) throw new Error("Unsafe path argument");
  if (/^[A-Za-z]:[\\/]/.test(argument) || argument.startsWith("/") || argument.startsWith("\\")) {
    throw new Error("Absolute paths are not allowed in terminal commands");
  }
  if (/^(--cwd|--directory|-C|--prefix)=?/.test(argument)) throw new Error("Changing the terminal root is not allowed");
}

export function parseCommand(command: string) {
  const tokens = tokenize(command);
  const name = tokens[0].toLowerCase().replace(/\.cmd$|\.exe$/i, "");
  const policy = COMMAND_POLICIES[name];
  if (!policy) throw new Error(`Command is not allowed: ${tokens[0]}`);

  const args = tokens.slice(1);
  for (const argument of args) assertSafeArgument(argument);
  const subcommand = args[0] ?? "";
  if (!policy.subcommands.has(subcommand)) throw new Error(`Command is not allowed: ${name} ${subcommand}`);

  return { name, executable: policy.executable, args };
}

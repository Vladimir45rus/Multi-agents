type CommandPolicy = {
  executable: string;
  subcommands: Set<string>;
  allowRelativeScript?: boolean;
};

// H1 fix: flags that let package managers download and execute arbitrary
// packages (postinstall hooks) or change the execution root.
const PACKAGE_MANAGER_FLAG_BLOCKLIST = /^(?:--package(?:=|$)|--call(?:=|$)|--exec(?:=|$)|--shell(?:=|$)|--workspace(?:=|$)|-p$|-c$|-w$)/i;

const PACKAGE_MANAGERS = new Set(["npm", "npx", "pnpm", "yarn", "bun"]);

const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9@][A-Za-z0-9@:._/-]*$/;

// H1 fix: lifecycle scripts fire automatically around other commands and are a
// classic arbitrary-code-execution vector; they are never valid direct targets.
const UNSAFE_LIFECYCLE_SCRIPTS = /^(?:pre|post)?(?:install|unpack|prepare|pack|publish|version|shrinkwrap)$/i;

export type ParseCommandOptions = {
  allowedNpmScripts?: ReadonlySet<string>;
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
  node: { executable: process.platform === "win32" ? "node.exe" : "node", subcommands: new Set(["--version", "--help"]), allowRelativeScript: true },
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

function assertSafeNpmScript(manager: string, subcommand: string, scriptName: string, allowed?: ReadonlySet<string>) {
  if (!scriptName || !SCRIPT_NAME_PATTERN.test(scriptName)) {
    throw new Error(`Invalid ${manager} ${subcommand} script name`);
  }
  if (UNSAFE_LIFECYCLE_SCRIPTS.test(scriptName)) {
    throw new Error(`${manager} ${subcommand} "${scriptName}" is a lifecycle script and is not allowed`);
  }
  if (allowed && !allowed.has(scriptName)) {
    throw new Error(`${manager} ${subcommand} script is not defined in package.json: ${scriptName}`);
  }
}

export function parseCommand(command: string, options?: ParseCommandOptions) {
  const tokens = tokenize(command);
  const name = tokens[0].toLowerCase().replace(/\.cmd$|\.exe$/i, "");
  const policy = COMMAND_POLICIES[name];
  if (!policy) throw new Error(`Command is not allowed: ${tokens[0]}`);

  const args = tokens.slice(1);
  for (const argument of args) assertSafeArgument(argument);
  // H1 fix: reject package-manager flags that pull in arbitrary packages.
  if (PACKAGE_MANAGERS.has(name)) {
    for (const argument of args) {
      if (PACKAGE_MANAGER_FLAG_BLOCKLIST.test(argument)) throw new Error(`Flag is not allowed for ${name}: ${argument}`);
    }
  }

  const subcommand = args[0] ?? "";
  const allowedRelativeScript = Boolean(
    policy.allowRelativeScript
      && !subcommand.startsWith(".")
      && !subcommand.startsWith("/")
      && !subcommand.startsWith("\\\\")
      && /\.(?:cjs|mjs|js)$/i.test(subcommand),
  );
  if (!policy.subcommands.has(subcommand) && !allowedRelativeScript) throw new Error(`Command is not allowed: ${name} ${subcommand}`);

  // H1 fix: bun x / npm exec take an arbitrary package as their positional
  // target; restrict it to the same vetted tool allowlist as npx. (For npx
  // itself the tool name is already enforced by the subcommand policy above,
  // and package smuggling via flags is blocked by the flag blocklist.)
  const toolAllowlist = COMMAND_POLICIES.npx.subcommands;
  const runsArbitraryPackageTarget = (name === "bun" && subcommand === "x") || (name === "npm" && subcommand === "exec");
  if (runsArbitraryPackageTarget) {
    const target = args[1] ?? "";
    if (!target || !toolAllowlist.has(target)) throw new Error(`Command is not allowed: ${name} ${subcommand} ${target}`.trimEnd());
  }

  // H1 fix: npm-style "run" scripts must be well-formed, must not be lifecycle
  // hooks, and (when a scripts manifest was provided) must exist in the
  // workspace package.json.
  if (PACKAGE_MANAGERS.has(name) && subcommand === "run") {
    assertSafeNpmScript(name, subcommand, args[1] ?? "", options?.allowedNpmScripts);
  }

  return { name, executable: policy.executable, args };
}

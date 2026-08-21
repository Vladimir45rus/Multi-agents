const { spawn } = require("node:child_process");
const path = require("node:path");

const electronBinary = process.platform === "win32"
  ? path.join(__dirname, "..", "node_modules", "electron", "dist", "electron.exe")
  : path.join(__dirname, "..", "node_modules", ".bin", "electron");

const child = spawn(electronBinary, [path.join(__dirname, "..", "electron", "main.cjs")], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

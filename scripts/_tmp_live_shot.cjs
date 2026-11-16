// Headless screenshot of the running dev server with the disclaimer pre-accepted.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9223;
const URL = "http://127.0.0.1:3999/";
const OUT = path.join(__dirname, "..", "design", "ui-live.png");
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "ma-shot-"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const edge = spawn(EDGE, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--window-size=1600,950",
    "--hide-scrollbars",
    "--disable-gpu",
    "about:blank",
  ], { stdio: "ignore" });

  // wait for the debugger endpoint
  let targets = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await response.json();
      if (Array.isArray(targets) && targets.some((t) => t.type === "page")) break;
    } catch {
      /* keep waiting */
    }
  }
  const page = (targets ?? []).find((t) => t.type === "page");
  if (!page) throw new Error("no page target");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

  const send = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL });
  await sleep(12000);

  await send("Runtime.evaluate", {
    expression: "localStorage.setItem('code-studio-disclaimer-accepted','true'); localStorage.setItem('ui-locale','ru');",
  });
  await send("Page.reload", {});
  await sleep(12000);

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
  console.log("saved", OUT);

  ws.close();
  edge.kill();
  await sleep(500);
  process.exit(0);
})().catch((error) => {
  console.error("failed:", error.message);
  process.exit(1);
});

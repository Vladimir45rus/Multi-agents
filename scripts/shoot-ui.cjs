// Shoot the running studio through Edge + CDP (Node 22+ has a global WebSocket).
// Usage: node scripts/shoot-ui.cjs <url> <out.png> [width] [height] [--accept]
const fs = require("node:fs");
const { setTimeout: delay } = require("node:timers/promises");

const url = process.argv[2] ?? "http://127.0.0.1:3210";
const out = process.argv[3] ?? "design/ui-live.png";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 900);
const accept = process.argv.includes("--accept");

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  };
  return {
    send(method, params = {}) {
      id += 1;
      const messageId = id;
      return new Promise((resolve) => {
        pending.set(messageId, resolve);
        ws.send(JSON.stringify({ id: messageId, method, params }));
      });
    },
    close() { ws.close(); },
  };
}

(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  let target = targets.find((item) => item.type === "page");
  if (!target) {
    target = await (await fetch(`http://127.0.0.1:9222/json/new?about:blank`)).json();
  }
  const client = await cdp(target.webSocketDebuggerUrl);

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  if (accept) {
    await client.send("Page.navigate", { url });
    await delay(2500);
    await client.send("Runtime.evaluate", {
      expression: `localStorage.setItem('code-studio-disclaimer-accepted','true'); localStorage.setItem('code-studio-theme','dark');`,
    });
  }

  await client.send("Page.navigate", { url });
  await delay(6000);

  const jsArg = process.argv.find((item) => item.startsWith("--js="));
  const jsFileArg = process.argv.find((item) => item.startsWith("--js-file="));
  const expression = jsFileArg ? fs.readFileSync(jsFileArg.slice(10), "utf8") : jsArg ? jsArg.slice(5) : "";
  if (expression) {
    await client.send("Runtime.evaluate", { expression });
    await delay(2000);
  }

  const shot = await client.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("saved", out);
  client.close();
})().catch((error) => {
  console.error("shoot failed:", error);
  process.exit(1);
});

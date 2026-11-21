// node scripts/cdp-size-eval.cjs <width> <height> <js> [urlFilter]
const width = Number(process.argv[2] ?? 1440);
const height = Number(process.argv[3] ?? 900);
const expression = process.argv[4] ?? "1";
const want = process.argv[5] ?? "";

(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const page = targets.find((item) => item.type === "page" && (!want || item.url.includes(want))) ?? targets.find((item) => item.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await new Promise((resolve) => setTimeout(resolve, 600));
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(result.result?.result?.value ?? result.result?.exceptionDetails?.text ?? result).slice(0, 3000));
  ws.close();
})().catch((error) => { console.error(error.message); process.exit(1); });

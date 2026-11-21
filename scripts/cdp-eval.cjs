// Tiny CDP eval helper: node scripts/cdp-eval.cjs "<js expression>"
const url = process.argv[2] ?? "about:blank";

(async () => {
  const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const want = process.argv[3] || "";
  const page = targets.find((item) => item.type === "page" && (!want || item.url.includes(want))) || targets.find((item) => item.type === "page");
  if (!page) throw new Error("no page target");
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
  const result = await send("Runtime.evaluate", { expression: url, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(result.result?.result?.value ?? result.result?.exceptionDetails ?? result, null, 2).slice(0, 2000));
  ws.close();
})().catch((error) => { console.error(error.message); process.exit(1); });

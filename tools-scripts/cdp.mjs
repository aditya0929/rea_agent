// Minimal CDP driver for checking the app in the debug Chrome on :9333.
// Usage: node cdp.mjs <url> <out.png> [script.js] [width=1440] [height=900]
// The optional script runs in the page after load; it may return a promise.
// Prints console errors and the script's return value.
import { readFileSync, writeFileSync } from "node:fs";

const [url, out, scriptPath, w = "1440", h = "900", wait = "3500", after = "1500"] = process.argv.slice(2);
const target = await (await fetch(`http://127.0.0.1:9333/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  } else if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url });
await sleep(+wait);
if (scriptPath) {
  const res = await send("Runtime.evaluate", { expression: readFileSync(scriptPath, "utf8"), awaitPromise: true, returnByValue: true });
  const r = res.result;
  if (r?.exceptionDetails) errors.push(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  else if (r?.result?.value !== undefined) console.log("script:", JSON.stringify(r.result.value));
  await sleep(+after);
}
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.result.data, "base64"));
console.log(errors.length ? `console errors:\n${errors.join("\n")}` : "no console errors");
await fetch(`http://127.0.0.1:9333/json/close/${target.id}`);
ws.close();

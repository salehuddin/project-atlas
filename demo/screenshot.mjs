/**
 * Renders the demo harness in headless Chrome/Edge and saves the README images
 * to docs/screenshots/. Run `npm run demo:build` first (or use `npm run screenshots`).
 *
 * It drives the browser over the DevTools protocol so the viewport size is
 * exact, and trims each image to its content. Needs Node 22+ (global WebSocket).
 * Set CHROME_PATH if your browser is not found automatically.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = pathToFileURL(path.join(root, "demo", "dist", "index.html")).href;
const outDir = path.join(root, "docs", "screenshots");
const PORT = 9341;

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const browserPath = CANDIDATES.find((candidate) => candidate && existsSync(candidate));
if (!browserPath) {
  console.error("No Chrome or Edge found. Set CHROME_PATH.");
  process.exit(1);
}

const shots = [
  { file: "board.png", query: "", hash: "", width: 1280 },
  { file: "project.png", query: "", hash: "#project=Lumen%20Bakery", width: 1280 },
  { file: "rail.png", query: "?surface=panel", hash: "", width: 440, height: 900 },
  { file: "board-light.png", query: "?theme=light", hash: "", width: 1280 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), "atlas-shot-"));
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--allow-file-access-from-files",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const target = targets.find((item) => item.type === "page");
      if (target) return target.webSocketDebuggerUrl;
    } catch {
      /* browser still starting */
    }
    await sleep(250);
  }
  throw new Error("Could not reach the browser's debugging port.");
}

try {
  const socket = new WebSocket(await connect());
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });

  const metrics = (width, height) =>
    send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });

  await send("Page.enable");

  for (const shot of shots) {
    await metrics(shot.width, shot.height ?? 2400);
    await send("Page.navigate", { url: "about:blank" });
    await sleep(200);
    await send("Page.navigate", { url: `${page}${shot.query}${shot.hash}` });
    await sleep(1800);

    let height = shot.height;
    if (!height) {
      const { result } = await send("Runtime.evaluate", {
        expression: `Math.ceil(
          (document.querySelector('#grid').lastElementChild?.getBoundingClientRect().bottom ?? 0)
          + document.querySelector('#footer').offsetHeight + 24)`,
        returnByValue: true,
      });
      height = result.value;
      await metrics(shot.width, height);
      await sleep(300);
    }

    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const target = path.join(outDir, shot.file);
    writeFileSync(target, Buffer.from(data, "base64"));
    console.log("wrote", path.relative(root, target), `${shot.width}x${height} @2x`);
  }
  socket.close();
} finally {
  browser.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* the browser may still hold the profile for a moment; the OS temp cleaner takes it */
  }
}

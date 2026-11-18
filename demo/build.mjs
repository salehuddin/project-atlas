import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "demo", "dist");
await mkdir(out, { recursive: true });

/** Swap the SDK for the demo mocks, so the real panel code runs without OpenChamber. */
const mockSdk = {
  name: "mock-sdk",
  setup(b) {
    b.onResolve({ filter: /^@openchamber\/sdk\/ui$/ }, () => ({ path: path.join(root, "demo", "mock-ui.ts") }));
    b.onResolve({ filter: /^@openchamber\/sdk$/ }, () => ({ path: path.join(root, "demo", "mock-sdk.ts") }));
  },
};

await build({
  entryPoints: [path.join(root, "demo", "entry.ts")],
  outfile: path.join(out, "main.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  legalComments: "none",
  logLevel: "warning",
  plugins: [mockSdk],
});

await writeFile(path.join(out, "index.html"), await readFile(path.join(root, "src", "panel", "index.html"), "utf8"));
console.log("built demo/dist/index.html + main.js");

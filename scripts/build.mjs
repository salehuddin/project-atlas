import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";

await mkdir("panel", { recursive: true });
await mkdir("service", { recursive: true });

await build({
  entryPoints: ["src/panel/main.ts"],
  outfile: "panel/main.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  legalComments: "none",
  logLevel: "warning",
});

await build({
  entryPoints: ["src/service/main.ts"],
  outfile: "service/main.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["node20"],
  legalComments: "none",
  logLevel: "warning",
});

await copyFile("src/panel/index.html", "panel/index.html");
console.log("built panel/main.js, service/main.js, panel/index.html");

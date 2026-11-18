import { readFileSync, existsSync } from "node:fs";
import { parseManifest } from "@openchamber/sdk/schemas";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const result = parseManifest(pkg);

if (!result.ok) {
  console.error(`manifest invalid: ${result.code} — ${result.message}`);
  process.exit(1);
}

const panelEntry = result.manifest.contributes.panel.entry;
const serviceEntry = result.manifest.contributes.service?.entry;

for (const file of [panelEntry, serviceEntry, "panel/main.js"].filter(Boolean)) {
  if (!existsSync(file)) {
    console.error(`missing built file: ${file}`);
    process.exit(1);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      id: result.manifest.contributes.panel.id,
      name: result.manifest.contributes.panel.name,
      page: result.manifest.contributes.page,
      capabilities: result.manifest.contributes.capabilities,
      service: serviceEntry,
      version: result.version,
    },
    null,
    2,
  ),
);

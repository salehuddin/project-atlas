/**
 * Starts the service the way OpenChamber does and prints what it answers.
 *
 *   npm run smoke -- "<project folder>" [projectId]
 *
 * or:
 *
 *   SMOKE_DIRS="C:\\one;D:\\two" SMOKE_PROJECT_ID=path_... npm run smoke
 *
 * The project id is the `path_...` id OpenChamber uses; with it the script also
 * prints activity and plans.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const PORT = Number(process.env.SMOKE_PORT ?? 34567);
const TOKEN = process.env.SMOKE_TOKEN ?? "smoke-token";
const projectId = process.env.SMOKE_PROJECT_ID ?? args[1] ?? "";
const dirs = (process.env.SMOKE_DIRS ? process.env.SMOKE_DIRS.split(path.delimiter) : args[0] ? [args[0]] : [process.cwd()]).map(
  (dir) => path.resolve(dir),
);

const child = spawn(process.execPath, ["service/main.js"], {
  env: {
    ...process.env,
    OPENCHAMBER_SERVICE_PORT: String(PORT),
    OPENCHAMBER_SERVICE_TOKEN: TOKEN,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stderr.on("data", (chunk) => process.stderr.write(chunk));

const base = `http://127.0.0.1:${PORT}`;
const headers = { authorization: `Bearer ${TOKEN}` };

async function waitForHealth() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("service never became healthy");
}

try {
  await waitForHealth();
  console.log("unauthenticated /vitals ->", (await fetch(`${base}/vitals`)).status);

  try {
    const projects = await (await fetch(`${base}/projects`, { headers })).json();
    console.log(`\n/projects: ${projects.projects.length} from OpenChamber settings`);
    for (const project of projects.projects.slice(0, 8)) {
      const icon = project.icon ? `${project.icon.slice(0, 24)}… (${project.icon.length})` : "none";
      console.log(`  ${String(project.name ?? project.id).padEnd(24)} icon=${icon} color=${project.color ?? "-"}`);
    }
  } catch {
    console.log("\n/projects: no OpenChamber settings found (expected outside OpenChamber)");
  }

  for (const directory of dirs) {
    const vitals = await (await fetch(`${base}/vitals?directory=${encodeURIComponent(directory)}`, { headers })).json();
    console.log(`\n${directory}`);
    console.log(`  branch=${vitals.branch} kind=${vitals.kind} stack=[${vitals.stack.join(", ")}]`);
    console.log(`  ahead=${vitals.ahead} behind=${vitals.behind} dirtySince=${vitals.dirtySince} detached=${vitals.detached}`);
    console.log(`  size=${vitals.size.state} deployments=${vitals.deployments.length}`);
    for (const deployment of vitals.deployments) {
      const cert = deployment.cert
        ? ` cert(daysLeft=${deployment.cert.daysLeft} auth=${deployment.cert.authorized}${deployment.cert.error ? ` err=${deployment.cert.error}` : ""})`
        : " cert=null";
      console.log(`  deploy ${deployment.label.padEnd(9)} ${deployment.url} live=${deployment.live} ms=${deployment.ms}${cert} (${deployment.source})`);
    }

    const git = await (await fetch(`${base}/git?directory=${encodeURIComponent(directory)}`, { headers })).json();
    console.log(`  /git available=${git.available} total=${git.total} currentStreak=${git.currentStreak} bestStreak=${git.bestStreak} days=${git.days.length}`);
    if (git.lastCommit) console.log(`  lastCommit ${git.lastCommit.hash} ${git.lastCommit.subject} (${new Date(git.lastCommit.at).toISOString()})`);
    console.log(`  sync ahead=${git.ahead} behind=${git.behind} upstream=${git.upstream} dirtySince=${git.dirtySince} detached=${git.detached}`);
  }

  if (projectId && dirs[0]) {
    const activity = await (
      await fetch(
        `${base}/activity?directory=${encodeURIComponent(dirs[0])}&projectId=${encodeURIComponent(projectId)}&days=30`,
        { headers },
      )
    ).json();
    console.log("\n/activity");
    console.log(
      `  available=${activity.available} steps=${activity.steps} prompts=${activity.prompts} sessions=${activity.sessions} activeDays=${activity.activeDays} streak=${activity.streak}`,
    );
    console.log(`  points=${activity.points.length}`);
    console.log(
      `  todos open=${activity.knowledge.openTodos} plans=${activity.knowledge.plans.length} notes=${activity.knowledge.notes}`,
    );
    for (const plan of activity.knowledge.plans.slice(0, 3)) {
      console.log(`  plan ${plan.done}/${plan.total} open=${plan.open} ${plan.title}`);
    }
  }
} finally {
  child.kill();
}

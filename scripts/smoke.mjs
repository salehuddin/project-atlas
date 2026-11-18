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

    const spend = await (await fetch(`${base}/spend?directory=${encodeURIComponent(directory)}&days=30`, { headers })).json();
    console.log(`  /spend available=${spend.available} tokens=${spend.tokens.total} cost=${spend.cost} sessions=${spend.sessions}`);
    for (const model of (spend.models ?? []).slice(0, 4)) {
      console.log(`  model ${model.name} tokens=${model.tokens} cost=${model.cost} share=${Math.round(model.share * 100)}%`);
    }

    const disk = await (await fetch(`${base}/disk?directory=${encodeURIComponent(directory)}`, { headers })).json();
    console.log(`  /disk available=${disk.available} total=${disk.total} files=${disk.files} truncated=${disk.truncated} reclaimable=${disk.reclaimableBytes}`);
    for (const category of disk.categories ?? []) {
      console.log(`  cat ${category.id.padEnd(12)} bytes=${category.bytes} files=${category.files} reclaimable=${category.reclaimable}`);
    }
    for (const kid of (disk.children ?? []).slice(0, 4)) {
      console.log(`  child ${String(kid.name).padEnd(20)} bytes=${kid.bytes} isDir=${kid.isDir}`);
    }
  }

  try {
    const inbox = await (await fetch(`${base}/inbox`, { headers })).json();
    console.log("\n/inbox");
    console.log(
      `  available=${inbox.available} items=${inbox.items.length} todos=${inbox.counts.todos} steps=${inbox.counts.steps} truncated=${inbox.truncated}`,
    );
    const byProject = new Map();
    for (const item of inbox.items) byProject.set(item.projectId, (byProject.get(item.projectId) ?? 0) + 1);
    const counts = [...byProject.values()].slice(0, 8);
    console.log(`  projects with open items: ${byProject.size} (top counts: ${counts.join(", ")})`);
  } catch {
    console.log("\n/inbox: failed");
  }

  // /reveal must only open paths inside the project directory.
  if (dirs[0]) {
    console.log("\n/reveal path validation");
    const evil = path.basename(dirs[0]) + "-evil";
    for (const [label, body, want] of [
      ["sibling-prefix", { directory: dirs[0], path: `../${evil}` }, 400],
      ["absolute", { directory: dirs[0], path: "C:/Windows" }, 400],
      ["parent", { directory: dirs[0], path: ".." }, 400],
      ["missing", { directory: dirs[0], path: "no-such-file-xyz" }, 400],
      ["relative-dir", { directory: "relative/path", path: "x" }, 400],
    ]) {
      const response = await fetch(`${base}/reveal`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const ok = response.status === want ? "ok" : `UNEXPECTED (${response.status})`;
      console.log(`  ${label} -> ${response.status} ${ok}`);
    }
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

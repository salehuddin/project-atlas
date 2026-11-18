var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/service/main.ts
var import_node_http = __toESM(require("node:http"));
var import_node_path = __toESM(require("node:path"));
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_crypto = require("node:crypto");
var PORT = Number(process.env.OPENCHAMBER_SERVICE_PORT ?? 0);
var TOKEN = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
var HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";
var CONFIG_DIR = process.env.XDG_CONFIG_HOME ? import_node_path.default.join(process.env.XDG_CONFIG_HOME, "openchamber") : import_node_path.default.join(HOME, ".config", "openchamber");
var SETTINGS_FILE = import_node_path.default.join(CONFIG_DIR, "settings.json");
var PROJECT_ICONS_DIR = import_node_path.default.join(CONFIG_DIR, "project-icons");
var PROJECTS_DIR = import_node_path.default.join(CONFIG_DIR, "projects");
var MEASURE_BUDGET_MS = 12e3;
var MEASURE_MAX_FILES = 3e5;
var SIZE_TTL_MS = 12 * 60 * 60 * 1e3;
var FACTS_TTL_MS = 3e4;
var PROBE_TTL_MS = 10 * 60 * 1e3;
var PROJECTS_TTL_MS = 2 * 60 * 1e3;
var factsCache = /* @__PURE__ */ new Map();
var sizes = /* @__PURE__ */ new Map();
var iconCache = /* @__PURE__ */ new Map();
var localIconCache = /* @__PURE__ */ new Map();
var probeCache = /* @__PURE__ */ new Map();
var activityCache = /* @__PURE__ */ new Map();
var knowledgeCache = /* @__PURE__ */ new Map();
var projectsCache = null;
var localProjectsCache = null;
function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 256e3) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function safeDir(input) {
  if (typeof input !== "string" || !input || input.includes("\0")) return null;
  if (!import_node_path.default.isAbsolute(input)) return null;
  return import_node_path.default.normalize(input);
}
function shortPath(dir) {
  if (HOME && dir.toLowerCase().startsWith(HOME.toLowerCase())) {
    return `~${dir.slice(HOME.length)}`;
  }
  return dir;
}
async function run(bin, args, cwd) {
  return new Promise((resolve) => {
    (0, import_node_child_process.execFile)(
      bin,
      args,
      { cwd, timeout: 8e3, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) resolve(null);
        else resolve(stdout.toString());
      }
    );
  });
}
async function readJson(file) {
  try {
    const raw = await import_node_fs.promises.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function readText(file, limit = 64e3) {
  try {
    const raw = await import_node_fs.promises.readFile(file, "utf8");
    return raw.slice(0, limit);
  } catch {
    return null;
  }
}
async function exists(file) {
  try {
    await import_node_fs.promises.access(file);
    return true;
  } catch {
    return false;
  }
}
function normalizeUrl(raw) {
  if (!raw) return null;
  let value = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!value || /^(null|undefined|true|false|~)$/i.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) {
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(value)) return null;
    value = `https://${value}`;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".")) return null;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".test") || host.endsWith(".localhost")) {
      return null;
    }
    url.hash = "";
    const text = url.toString();
    return text.endsWith("/") ? text.slice(0, -1) : text;
  } catch {
    return null;
  }
}
var measureChain = Promise.resolve();
async function measure(root) {
  const started = Date.now();
  let bytes = 0;
  let files = 0;
  let truncated = false;
  const pending = [root];
  while (pending.length) {
    if (Date.now() - started > MEASURE_BUDGET_MS) {
      truncated = true;
      break;
    }
    const dir = pending.pop();
    if (!dir) break;
    let entries;
    try {
      entries = await import_node_fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const filePaths = [];
    for (const entry of entries) {
      const full = import_node_path.default.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) filePaths.push(full);
    }
    for (let i = 0; i < filePaths.length; i += 64) {
      const batch = filePaths.slice(i, i + 64);
      const stats = await Promise.all(batch.map((p) => import_node_fs.promises.stat(p).catch(() => null)));
      for (const stat of stats) {
        if (stat?.isFile()) {
          bytes += stat.size;
          files += 1;
        }
      }
    }
    if (files > MEASURE_MAX_FILES) {
      truncated = true;
      break;
    }
  }
  return { bytes, files, truncated };
}
function enqueueMeasure(fn) {
  measureChain = measureChain.then(fn).catch(() => {
  });
}
function ensureSize(dir, force) {
  const current = sizes.get(dir);
  const now = Date.now();
  if (current) {
    if (current.state === "running") return current;
    if (!force && current.state === "ready" && current.at && now - current.at < SIZE_TTL_MS) {
      return current;
    }
  }
  const running = {
    bytes: current?.bytes ?? null,
    files: current?.files ?? null,
    at: current?.at ?? null,
    state: "running",
    truncated: false
  };
  sizes.set(dir, running);
  enqueueMeasure(async () => {
    try {
      const result = await measure(dir);
      sizes.set(dir, {
        bytes: result.bytes,
        files: result.files,
        at: Date.now(),
        state: "ready",
        truncated: result.truncated
      });
    } catch {
      sizes.set(dir, {
        bytes: current?.bytes ?? null,
        files: current?.files ?? null,
        at: current?.at ?? null,
        state: "ready",
        truncated: true
      });
    }
  });
  return running;
}
var FAVICON_CANDIDATES = [
  "favicon.ico",
  "favicon.png",
  "favicon.svg",
  "public/favicon.ico",
  "public/favicon.png",
  "public/favicon.svg",
  "static/favicon.ico",
  "static/favicon.png",
  "static/favicon.svg",
  "src/favicon.ico",
  "src/favicon.png",
  "src/favicon.svg",
  "src/app/favicon.ico",
  "app/favicon.ico",
  "assets/favicon.ico",
  "images/favicon.ico",
  "img/favicon.ico"
];
var MIME_BY_EXT = {
  ".ico": "image/vnd.microsoft.icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};
async function faviconDataUrl(dir) {
  const cached = iconCache.get(dir);
  if (cached !== void 0) return cached;
  let result = null;
  for (const candidate of FAVICON_CANDIDATES) {
    const file = import_node_path.default.join(dir, candidate);
    const stat = await import_node_fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size === 0 || stat.size > 2e5) continue;
    try {
      const buffer = await import_node_fs.promises.readFile(file);
      const mime = MIME_BY_EXT[import_node_path.default.extname(file).toLowerCase()] ?? "image/png";
      result = `data:${mime};base64,${buffer.toString("base64")}`;
      break;
    } catch {
      continue;
    }
  }
  iconCache.set(dir, result);
  return result;
}
async function readLocalProjects() {
  if (localProjectsCache && Date.now() - localProjectsCache.at < PROJECTS_TTL_MS) {
    return localProjectsCache.projects;
  }
  const data = await readJson(SETTINGS_FILE);
  const projects = Array.isArray(data?.projects) ? data.projects.filter((item) => item && typeof item.id === "string") : [];
  localProjectsCache = { at: Date.now(), projects };
  return projects;
}
async function localIcon(project) {
  if (localIconCache.has(project.id)) return localIconCache.get(project.id) ?? null;
  const hash = (0, import_node_crypto.createHash)("sha1").update(project.id).digest("hex");
  let result = null;
  for (const ext of ["png", "svg", "webp", "jpg", "jpeg", "gif"]) {
    const file = import_node_path.default.join(PROJECT_ICONS_DIR, `project-${hash}.${ext}`);
    const stat = await import_node_fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size === 0 || stat.size > 512e3) continue;
    try {
      const buffer = await import_node_fs.promises.readFile(file);
      const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      result = `data:${mime};base64,${buffer.toString("base64")}`;
      break;
    } catch {
      continue;
    }
  }
  localIconCache.set(project.id, result);
  return result;
}
function colorOf(project) {
  for (const value of [project.iconBackground, project.color]) {
    if (typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value)) return value;
  }
  return null;
}
async function projectsPayload() {
  const now = Date.now();
  if (projectsCache && now - projectsCache.at < PROJECTS_TTL_MS) return projectsCache.data;
  const local = await readLocalProjects();
  const projects = [];
  for (const project of local) {
    const directory = typeof project.path === "string" ? import_node_path.default.normalize(project.path) : null;
    const icon = await localIcon(project) ?? (directory ? await faviconDataUrl(directory) : null);
    projects.push({
      id: project.id,
      name: project.label ?? (directory ? import_node_path.default.basename(directory) : null),
      directory,
      icon,
      color: colorOf(project),
      symbol: project.icon ?? null
    });
  }
  const data = { available: local.length > 0, projects };
  projectsCache = { at: now, data };
  return data;
}
async function probeUrl(url) {
  const cached = probeCache.get(url);
  if (cached && Date.now() - cached.at < PROBE_TTL_MS) {
    return { live: cached.live, status: cached.status };
  }
  let live = null;
  let status = null;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(4500),
      headers: {
        "user-agent": "ProjectAtlas/0.2 (OpenChamber extension)",
        accept: "text/html,application/xhtml+xml,*/*;q=0.5"
      }
    });
    status = response.status;
    live = response.status < 400;
    try {
      await response.body?.cancel();
    } catch {
    }
  } catch {
    live = false;
    status = null;
  }
  probeCache.set(url, { at: Date.now(), live, status });
  return { live, status };
}
function labelForKey(key) {
  const upper = key.toUpperCase();
  if (upper.includes("API")) return "API";
  if (upper.includes("FRONT")) return "Frontend";
  if (upper.includes("ADMIN")) return "Admin";
  if (upper.includes("APP")) return "App";
  if (upper.includes("WP")) return "Site";
  return "Site";
}
function pushCandidate(list, candidate) {
  const url = normalizeUrl(candidate.url);
  if (!url) return;
  if (list.some((item) => item.url === url)) return;
  list.push({ ...candidate, url });
}
async function envCandidates(dir, list) {
  for (const name of [".env", ".env.local", ".env.production", ".env.prod"]) {
    const text = await readText(import_node_path.default.join(dir, name), 2e4);
    if (!text) continue;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+#.*$/, "").trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!/(URL|HOME|SITE|DOMAIN)$/i.test(key)) continue;
      pushCandidate(list, {
        kind: "env",
        label: labelForKey(key),
        url: value,
        source: `${name} ${key}`
      });
    }
  }
}
function isRepoUrl(url) {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return host === "github.com" || host === "gitlab.com" || host === "bitbucket.org" || host === "codeberg.org";
  } catch {
    return false;
  }
}
async function detectDeployments(dir, pkg, composer, remote) {
  const list = [];
  for (const candidate of ["public/CNAME", "CNAME", "static/CNAME"]) {
    const text = await readText(import_node_path.default.join(dir, candidate), 512);
    const host = text?.trim().split(/\s+/)[0];
    if (host) {
      pushCandidate(list, { kind: "domain", label: "Live", url: host, source: candidate });
    }
  }
  for (const [value, source] of [
    [pkg?.homepage, "package.json homepage"],
    [composer?.homepage, "composer.json homepage"]
  ]) {
    if (typeof value === "string" && !isRepoUrl(value)) {
      pushCandidate(list, { kind: "homepage", label: "Homepage", url: value, source });
    }
  }
  await envCandidates(dir, list);
  const fly = await readText(import_node_path.default.join(dir, "fly.toml"), 8e3);
  const flyApp = fly?.match(/^\s*app\s*=\s*"([^"]+)"/m)?.[1];
  if (flyApp) {
    pushCandidate(list, { kind: "fly", label: "Fly", url: `https://${flyApp}.fly.dev`, source: "fly.toml" });
  }
  const wrangler = await readText(import_node_path.default.join(dir, "wrangler.toml"), 8e3);
  const worker = wrangler?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (worker && /pages_build_output_dir|\[\[pages\]\]/i.test(wrangler ?? "")) {
    pushCandidate(list, {
      kind: "cloudflare",
      label: "Pages",
      url: `https://${worker}.pages.dev`,
      source: "wrangler.toml"
    });
  }
  const firebase = await readJson(import_node_path.default.join(dir, ".firebaserc"));
  const firebaseId = firebase?.projects?.default;
  if (typeof firebaseId === "string") {
    pushCandidate(list, {
      kind: "firebase",
      label: "Firebase",
      url: `https://${firebaseId}.web.app`,
      source: ".firebaserc"
    });
  }
  const render = await readText(import_node_path.default.join(dir, "render.yaml"), 8e3);
  const renderName = render?.match(/^\s*-\s*type:\s*web[\s\S]*?^\s*name:\s*([A-Za-z0-9-]+)/m)?.[1];
  if (renderName) {
    pushCandidate(list, {
      kind: "render",
      label: "Render",
      url: `https://${renderName}.onrender.com`,
      source: "render.yaml"
    });
  }
  if (remote && /github\.com[:/]/i.test(remote)) {
    const cleaned = remote.replace(/\.git$/, "");
    const parts = cleaned.split(/[:/]/).filter(Boolean);
    const repo = parts[parts.length - 1];
    const owner = parts[parts.length - 2];
    if (repo && owner) {
      const pagesHost = `${owner.toLowerCase()}.github.io`;
      if (repo.toLowerCase() === pagesHost) {
        pushCandidate(list, { kind: "pages", label: "Pages", url: `https://${pagesHost}`, source: "GitHub user site" });
      } else {
        const branches = await run("git", ["-C", dir, "branch", "-a"]);
        if (branches && /(^|\/|\s)gh-pages(\s|$)/m.test(branches)) {
          pushCandidate(list, {
            kind: "pages",
            label: "Pages",
            url: `https://${pagesHost}/${repo}`,
            source: "gh-pages branch"
          });
        }
      }
    }
  }
  return list;
}
async function buildDeployments(dir, pkg, composer, remote) {
  const candidates = (await detectDeployments(dir, pkg, composer, remote)).slice(0, 4);
  return Promise.all(
    candidates.map(async (candidate) => ({ ...candidate, ...await probeUrl(candidate.url) }))
  );
}
function webFromRemote(remote) {
  if (!remote) return null;
  let value = remote.trim().replace(/\.git$/, "");
  if (value.startsWith("git@")) {
    const rest = value.slice(4);
    const colon = rest.indexOf(":");
    if (colon < 0) return null;
    return `https://${rest.slice(0, colon)}/${rest.slice(colon + 1)}`;
  }
  if (value.startsWith("ssh://")) {
    try {
      const url = new URL(value);
      return `https://${url.hostname}${url.pathname}`;
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(value)) return value.replace(/^http:\/\//i, "https://");
  return null;
}
async function detectSite(dir, pkg, composer) {
  for (const candidate of ["public/CNAME", "CNAME", "static/CNAME"]) {
    const text = await readText(import_node_path.default.join(dir, candidate), 512);
    const host = text?.trim().split(/\s+/)[0];
    if (host && host.includes(".") && !host.startsWith("#")) return `https://${host}`;
  }
  for (const value of [pkg?.homepage, composer?.homepage]) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}
async function detectStack(dir, pkg, composer) {
  const stack = [];
  const add = (label) => {
    if (label && !stack.includes(label) && stack.length < 7) stack.push(label);
  };
  if (pkg) add("Node");
  if (composer) add("PHP");
  const deps = {
    ...pkg?.dependencies ?? {},
    ...pkg?.devDependencies ?? {},
    ...pkg?.peerDependencies ?? {}
  };
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
  const php = { ...composer?.require ?? {}, ...composer?.["require-dev"] ?? {} };
  const hasPhp = (name) => Object.prototype.hasOwnProperty.call(php, name);
  if (has("next")) add("Next.js");
  else if (has("nuxt")) add("Nuxt");
  else if (has("astro")) add("Astro");
  else if (has("svelte") || has("@sveltejs/kit")) add("Svelte");
  else if (has("vue")) add("Vue");
  else if (has("@angular/core")) add("Angular");
  else if (has("react")) add("React");
  if (has("expo")) add("Expo");
  else if (has("react-native")) add("React Native");
  if (has("electron")) add("Electron");
  if (has("tailwindcss")) add("Tailwind");
  if (has("express") || has("fastify") || has("hono") || has("koa")) add("Server");
  if (hasPhp("laravel/framework")) add("Laravel");
  if (hasPhp("symfony/symfony") || hasPhp("symfony/framework-bundle")) add("Symfony");
  if (hasPhp("roots/sage")) add("Sage");
  if (hasPhp("johnpbloch/wordpress-core") || hasPhp("wordpress/wordpress")) add("WordPress");
  const checks = [
    ["wp-config.php", "WordPress"],
    ["go.mod", "Go"],
    ["Cargo.toml", "Rust"],
    ["Gemfile", "Ruby"],
    ["pyproject.toml", "Python"],
    ["requirements.txt", "Python"],
    ["Dockerfile", "Docker"],
    ["docker-compose.yml", "Docker"],
    ["vercel.json", "Vercel"],
    ["netlify.toml", "Netlify"],
    ["wrangler.toml", "Cloudflare"],
    ["turbo.json", "Turborepo"]
  ];
  const found = await Promise.all(checks.map(async ([file, label]) => await exists(import_node_path.default.join(dir, file)) ? label : null));
  for (const label of found) if (label) add(label);
  const managers = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lockb", "Bun"],
    ["bun.lock", "Bun"],
    ["yarn.lock", "Yarn"],
    ["package-lock.json", "npm"],
    ["composer.lock", "Composer"]
  ];
  const manager = await Promise.all(managers.map(async ([file, label]) => await exists(import_node_path.default.join(dir, file)) ? label : null));
  for (const label of manager) {
    if (label) {
      add(label);
      break;
    }
  }
  return stack;
}
async function collectFacts(dir, force) {
  const cached = factsCache.get(dir);
  if (!force && cached && Date.now() - cached.at < FACTS_TTL_MS) return cached.data;
  const isDir = await import_node_fs.promises.stat(dir).then((stat) => stat.isDirectory()).catch(() => false);
  const base = {
    directory: dir,
    shortPath: shortPath(dir),
    exists: isDir,
    branch: null,
    dirty: null,
    remote: null,
    web: null,
    site: null,
    stack: [],
    kind: "folder",
    deployments: []
  };
  if (!isDir) {
    const result2 = { ...base };
    factsCache.set(dir, { at: Date.now(), data: result2 });
    return result2;
  }
  const [branchOut, statusOut, remoteOut, pkg, composer] = await Promise.all([
    run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]),
    run("git", ["-C", dir, "status", "--porcelain"]),
    run("git", ["-C", dir, "config", "--get", "remote.origin.url"]),
    readJson(import_node_path.default.join(dir, "package.json")),
    readJson(import_node_path.default.join(dir, "composer.json"))
  ]);
  let branch = branchOut?.trim() || null;
  if (branch === "HEAD") {
    const sha = (await run("git", ["-C", dir, "rev-parse", "--short", "HEAD"]))?.trim();
    branch = sha ? `detached@${sha}` : "detached";
  }
  const dirty = statusOut == null ? null : statusOut.split("\n").filter((line) => line.trim().length > 0).length;
  const remote = remoteOut?.trim() || null;
  const [site, stack, deployments] = await Promise.all([
    detectSite(dir, pkg, composer),
    detectStack(dir, pkg, composer),
    buildDeployments(dir, pkg, composer, remote)
  ]);
  const result = {
    ...base,
    branch,
    dirty,
    remote,
    web: webFromRemote(remote),
    site,
    stack,
    kind: remote ? "repo" : "folder",
    deployments
  };
  factsCache.set(dir, { at: Date.now(), data: result });
  return result;
}
async function readmeFor(dir) {
  const names = ["README.md", "readme.md", "README.MD", "README.markdown", "README.txt", "README"];
  for (const name of names) {
    const file = import_node_path.default.join(dir, name);
    const stat = await import_node_fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile()) continue;
    const text = (await import_node_fs.promises.readFile(file, "utf8").catch(() => "")).slice(0, 8e3);
    const hash = (0, import_node_crypto.createHash)("sha1").update(text).update(String(stat.mtimeMs)).digest("hex").slice(0, 16);
    return { text, hash, name };
  }
  return { text: "", hash: "", name: null };
}
var ACTIVITY_TTL_MS = 2 * 60 * 1e3;
var KNOWLEDGE_TTL_MS = 60 * 1e3;
function dateKey(ms) {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function fillDays(activity, range, days) {
  const steps = /* @__PURE__ */ new Map();
  for (const entry of activity) {
    if (typeof entry?.date === "string") steps.set(entry.date, Number(entry.steps) || 0);
  }
  const end = new Date(range?.to ?? Date.now());
  const start = new Date(range?.from ?? end.getTime() - (days - 1) * 864e5);
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  const points = [];
  const cursor = new Date(start);
  while (cursor <= end && points.length < 400) {
    const key = dateKey(cursor.getTime());
    points.push({ date: key, steps: steps.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}
function cliCandidates() {
  const list = [];
  if (process.env.OPENCHAMBER_OPENCODE_CLI) list.push(process.env.OPENCHAMBER_OPENCODE_CLI);
  list.push("opencode");
  const dir = import_node_path.default.dirname(process.execPath);
  list.push(import_node_path.default.join(dir, "resources", "opencode-cli", "opencode.exe"));
  list.push(import_node_path.default.join(dir, "opencode-cli", "opencode.exe"));
  return list;
}
async function runStats(dir, days) {
  for (const bin of cliCandidates()) {
    const stdout = await new Promise((resolve) => {
      (0, import_node_child_process.execFile)(
        bin,
        ["stats", "--json", "--full", "--days", String(days), "--project", "."],
        { cwd: dir, timeout: 25e3, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
        (error, out) => resolve(error ? null : out.toString())
      );
    });
    if (!stdout) continue;
    try {
      return JSON.parse(stdout);
    } catch {
      continue;
    }
  }
  return null;
}
async function activityFor(dir, days) {
  const key = `${dir}|${days}`;
  const cached = activityCache.get(key);
  if (cached && Date.now() - cached.at < ACTIVITY_TTL_MS) return cached.data;
  const raw = await runStats(dir, days);
  const data = raw ? {
    available: true,
    days,
    sessions: Number(raw.sessions) || 0,
    prompts: Number(raw.prompts) || 0,
    steps: Number(raw.steps) || 0,
    activeDays: Number(raw.activeDays) || 0,
    streak: Number(raw.streak) || 0,
    cost: Number(raw.cost) || 0,
    points: fillDays(Array.isArray(raw.activity) ? raw.activity : [], raw.range, days)
  } : {
    available: false,
    days,
    sessions: 0,
    prompts: 0,
    steps: 0,
    activeDays: 0,
    streak: 0,
    cost: 0,
    points: fillDays([], void 0, days)
  };
  activityCache.set(key, { at: Date.now(), data });
  return data;
}
async function knowledgeFor(projectId) {
  const empty = {
    available: false,
    openTodos: 0,
    doneTodos: 0,
    todos: [],
    plans: [],
    notes: 0
  };
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(projectId)) return empty;
  const cached = knowledgeCache.get(projectId);
  if (cached && Date.now() - cached.at < KNOWLEDGE_TTL_MS) return cached.data;
  const base = import_node_path.default.join(PROJECTS_DIR, projectId);
  const context = await readJson(import_node_path.default.join(base, "context.json"));
  if (!context) {
    knowledgeCache.set(projectId, { at: Date.now(), data: empty });
    return empty;
  }
  const todos = Array.isArray(context.todos) ? context.todos : [];
  const plans = Array.isArray(context.plans) ? context.plans : [];
  const notes = Array.isArray(context.notes) ? context.notes : [];
  const planInfos = [];
  for (const plan of plans.slice(0, 60)) {
    const file = typeof plan?.file === "string" ? plan.file : null;
    if (!file) continue;
    const text = await readText(import_node_path.default.join(base, "plans", import_node_path.default.basename(file)), 3e5) ?? "";
    const boxes = text.match(/^[ \t]*[-*][ \t]+\[( |x|X)\]/gm) ?? [];
    const done = boxes.filter((box) => /\[[xX]\]/.test(box)).length;
    planInfos.push({
      id: plan.id ?? file,
      title: typeof plan.title === "string" ? plan.title : file,
      file,
      total: boxes.length,
      done,
      open: boxes.length - done,
      createdAt: plan.createdAt ?? null
    });
  }
  planInfos.sort((a, b) => b.open - a.open || b.total - a.total);
  const data = {
    available: true,
    openTodos: todos.filter((todo) => !todo?.completed).length,
    doneTodos: todos.filter((todo) => todo?.completed).length,
    todos: todos.filter((todo) => !todo?.completed).slice(0, 8).map((todo) => ({ text: String(todo.text ?? "").slice(0, 220), createdAt: todo.createdAt ?? null })),
    plans: planInfos,
    notes: notes.length
  };
  knowledgeCache.set(projectId, { at: Date.now(), data });
  return data;
}
function reveal(dir) {
  const [bin, args] = process.platform === "win32" ? ["explorer.exe", [dir]] : process.platform === "darwin" ? ["open", [dir]] : ["xdg-open", [dir]];
  try {
    const child = (0, import_node_child_process.spawn)(bin, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
var server = import_node_http.default.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/health") {
      json(res, 200, { ok: true });
      return;
    }
    if (TOKEN) {
      const header = req.headers.authorization ?? "";
      if (header !== `Bearer ${TOKEN}`) {
        json(res, 401, { error: "unauthorized" });
        return;
      }
    }
    if (req.method === "GET" && url.pathname === "/projects") {
      return json(res, 200, await projectsPayload());
    }
    if (req.method === "GET" && url.pathname === "/vitals") {
      const dir = safeDir(url.searchParams.get("directory"));
      if (!dir) return json(res, 400, { error: "bad directory" });
      const force = url.searchParams.get("force") === "1";
      const facts = await collectFacts(dir, force);
      const manual = normalizeUrl(url.searchParams.get("site"));
      let deployments = facts.deployments;
      if (manual) {
        const probed = await probeUrl(manual);
        deployments = [
          { kind: "manual", label: "Site", url: manual, source: "manual", ...probed },
          ...deployments.filter((item) => item.url !== manual)
        ];
      }
      const iconUrl = await faviconDataUrl(dir);
      const size = ensureSize(dir, force);
      return json(res, 200, { ...facts, deployments, iconUrl, size });
    }
    if (req.method === "GET" && url.pathname === "/size") {
      const dir = safeDir(url.searchParams.get("directory"));
      if (!dir) return json(res, 400, { error: "bad directory" });
      return json(res, 200, ensureSize(dir, url.searchParams.get("force") === "1"));
    }
    if (req.method === "GET" && url.pathname === "/readme") {
      const dir = safeDir(url.searchParams.get("directory"));
      if (!dir) return json(res, 400, { error: "bad directory" });
      return json(res, 200, await readmeFor(dir));
    }
    if (req.method === "GET" && url.pathname === "/activity") {
      const dir = safeDir(url.searchParams.get("directory"));
      if (!dir) return json(res, 400, { error: "bad directory" });
      const projectId = url.searchParams.get("projectId") ?? "";
      const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days")) || 30));
      const [activity, knowledge] = await Promise.all([activityFor(dir, days), knowledgeFor(projectId)]);
      return json(res, 200, { ...activity, knowledge });
    }
    if (req.method === "POST" && url.pathname === "/reveal") {
      const payload = JSON.parse(await readBody(req) || "{}");
      const dir = safeDir(payload.directory);
      if (!dir) return json(res, 400, { error: "bad directory" });
      return json(res, 200, { opened: reveal(dir) });
    }
    if (req.method === "POST" && url.pathname === "/refresh") {
      const payload = JSON.parse(await readBody(req) || "{}");
      const dir = safeDir(payload.directory);
      if (!dir) return json(res, 400, { error: "bad directory" });
      factsCache.delete(dir);
      iconCache.delete(dir);
      const facts = await collectFacts(dir, true);
      const size = ensureSize(dir, true);
      return json(res, 200, { ...facts, size });
    }
    json(res, 404, { error: "not found" });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});
server.listen(PORT, "127.0.0.1", () => {
});

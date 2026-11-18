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
var import_node_tls = __toESM(require("node:tls"));
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
var gitCache = /* @__PURE__ */ new Map();
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
async function checkTls(host) {
  return new Promise((resolve) => {
    let done = false;
    let socket = null;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
      }
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish({ validTo: null, daysLeft: null, issuer: null, authorized: false, error: "timeout" });
    }, 4e3);
    try {
      socket = import_node_tls.default.connect(
        { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 4e3 },
        () => {
          try {
            const peer = socket?.getPeerCertificate();
            const current = socket;
            const authorized = current?.authorized ?? false;
            const authError = current?.authorizationError ?? null;
            if (!peer || !peer.valid_to) {
              finish(null);
              return;
            }
            const validTo = Date.parse(peer.valid_to);
            const info = {
              validTo: Number.isNaN(validTo) ? null : validTo,
              daysLeft: Number.isNaN(validTo) ? null : Math.floor((validTo - Date.now()) / 864e5),
              issuer: peer.issuer?.CN ?? peer.issuer?.O ?? null,
              authorized
            };
            if (authError) info.error = String(authError);
            finish(info);
          } catch {
            finish(null);
          }
        }
      );
      socket.on("error", () => {
        finish({ validTo: null, daysLeft: null, issuer: null, authorized: false, error: "unreachable" });
      });
    } catch {
      finish(null);
    }
  });
}
async function probeUrl(url, force = false) {
  const cached = probeCache.get(url);
  if (!force && cached && Date.now() - cached.at < PROBE_TTL_MS) {
    return { live: cached.live, status: cached.status, ms: cached.ms, cert: cached.cert };
  }
  const started = Date.now();
  let live = null;
  let status = null;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(4500),
      headers: {
        "user-agent": "ProjectAtlas/0.5 (OpenChamber extension)",
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
  const ms = Date.now() - started;
  let cert = null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname) {
      cert = await checkTls(parsed.hostname);
    }
  } catch {
    cert = null;
  }
  probeCache.set(url, { at: Date.now(), live, status, ms, cert });
  return { live, status, ms, cert };
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
async function buildDeployments(dir, pkg, composer, remote, force) {
  const candidates = (await detectDeployments(dir, pkg, composer, remote)).slice(0, 4);
  return Promise.all(
    candidates.map(async (candidate) => ({ ...candidate, ...await probeUrl(candidate.url, force) }))
  );
}
async function gitAheadBehind(dir) {
  const upstream = (await run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]))?.trim();
  if (!upstream) return { ahead: null, behind: null, upstream: null };
  const counts = (await run("git", ["-C", dir, "rev-list", "--left-right", "--count", "@{u}...HEAD"]))?.trim();
  const match = counts?.match(/^(\d+)\s+(\d+)$/);
  if (!match) return { ahead: null, behind: null, upstream };
  return { ahead: Number(match[2]), behind: Number(match[1]), upstream };
}
async function dirtySinceMs(dir, statusOut) {
  if (!statusOut) return null;
  const files = [];
  for (const line of statusOut.split("\n")) {
    if (line.length < 4) continue;
    let file = line.slice(3).trim();
    if (!file) continue;
    const arrow = file.indexOf(" -> ");
    if (arrow >= 0) file = file.slice(arrow + 4);
    if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
    if (file) files.push(file);
    if (files.length >= 100) break;
  }
  if (!files.length) return null;
  let oldest = null;
  for (const file of files) {
    const stat = await import_node_fs.promises.stat(import_node_path.default.join(dir, file)).catch(() => null);
    const mtime = stat?.mtimeMs ?? null;
    if (mtime != null && (oldest == null || mtime < oldest)) oldest = mtime;
  }
  return oldest;
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
    deployments: [],
    ahead: null,
    behind: null,
    dirtySince: null,
    detached: false
  };
  if (!isDir) {
    const result2 = { ...base };
    factsCache.set(dir, { at: Date.now(), data: result2 });
    return result2;
  }
  const [branchOut, statusOut, remoteOut, upstreamOut, aheadBehindOut, pkg, composer] = await Promise.all([
    run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]),
    run("git", ["-C", dir, "status", "--porcelain"]),
    run("git", ["-C", dir, "config", "--get", "remote.origin.url"]),
    run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    run("git", ["-C", dir, "rev-list", "--left-right", "--count", "@{u}...HEAD"]),
    readJson(import_node_path.default.join(dir, "package.json")),
    readJson(import_node_path.default.join(dir, "composer.json"))
  ]);
  let branch = branchOut?.trim() || null;
  const detached = branch === "HEAD";
  if (detached) {
    const sha = (await run("git", ["-C", dir, "rev-parse", "--short", "HEAD"]))?.trim();
    branch = sha ? `detached@${sha}` : "detached";
  }
  const dirty = statusOut == null ? null : statusOut.split("\n").filter((line) => line.trim().length > 0).length;
  const remote = remoteOut?.trim() || null;
  let ahead = null;
  let behind = null;
  if (upstreamOut?.trim()) {
    const match = aheadBehindOut?.trim().match(/^(\d+)\s+(\d+)$/);
    if (match) {
      behind = Number(match[1]);
      ahead = Number(match[2]);
    }
  }
  const dirtySince = dirty ? await dirtySinceMs(dir, statusOut) : null;
  const [site, stack, deployments] = await Promise.all([
    detectSite(dir, pkg, composer),
    detectStack(dir, pkg, composer),
    buildDeployments(dir, pkg, composer, remote, force)
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
    deployments,
    ahead,
    behind,
    dirtySince,
    detached
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
var statsRunning = 0;
var statsQueue = [];
async function withStatsSlot(fn) {
  if (statsRunning >= 2) await new Promise((resolve) => statsQueue.push(resolve));
  statsRunning += 1;
  try {
    return await fn();
  } finally {
    statsRunning -= 1;
    const next = statsQueue.shift();
    if (next) next();
  }
}
async function runStatsRaw(dir, days, extra) {
  return withStatsSlot(async () => {
    for (const bin of cliCandidates()) {
      const stdout = await new Promise((resolve) => {
        (0, import_node_child_process.execFile)(
          bin,
          ["stats", "--json", "--full", ...extra, "--days", String(days), "--project", "."],
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
  });
}
async function runStats(dir, days) {
  return runStatsRaw(dir, days, []);
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
var GIT_TTL_MS = 2 * 60 * 1e3;
var GIT_DAYS = 182;
async function gitHistory(dir, force) {
  const cached = gitCache.get(dir);
  if (!force && cached && Date.now() - cached.at < GIT_TTL_MS) return cached.data;
  const empty = (partial = {}) => ({
    available: false,
    days: [],
    total: 0,
    bestStreak: 0,
    currentStreak: 0,
    lastCommit: null,
    ahead: null,
    behind: null,
    upstream: null,
    dirtySince: null,
    detached: false,
    ...partial
  });
  const gitDir = await run("git", ["-C", dir, "rev-parse", "--git-dir"]);
  if (gitDir == null) {
    const data2 = empty();
    gitCache.set(dir, { at: Date.now(), data: data2 });
    return data2;
  }
  const end = /* @__PURE__ */ new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end.getTime() - (GIT_DAYS - 1) * 864e5);
  const since = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const counts = /* @__PURE__ */ new Map();
  const log = await run("git", [
    "-C",
    dir,
    "log",
    "--all",
    "--since",
    `${since} 00:00:00`,
    "--pretty=format:%ad",
    "--date=short",
    "-n",
    "50000"
  ]);
  if (log) {
    for (const line of log.split("\n")) {
      const date = line.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  const days = [];
  const cursor = new Date(start);
  while (days.length < GIT_DAYS) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    days.push({ date: key, commits: counts.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  let bestStreak = 0;
  let streak = 0;
  for (const day of days) {
    streak = day.commits > 0 ? streak + 1 : 0;
    if (streak > bestStreak) bestStreak = streak;
  }
  let currentStreak = 0;
  const from = days.length && days[days.length - 1].commits === 0 ? days.length - 2 : days.length - 1;
  for (let index = from; index >= 0 && days[index].commits > 0; index -= 1) currentStreak += 1;
  let lastCommit = null;
  const last = await run("git", ["-C", dir, "log", "-1", "--pretty=format:%H%x1f%s%x1f%at"]);
  if (last) {
    const [hash, subject, at] = last.split("");
    if (hash && at && /^\d+$/.test(at.trim())) {
      lastCommit = { hash: hash.trim().slice(0, 7), subject: (subject ?? "").trim().slice(0, 160), at: Number(at.trim()) * 1e3 };
    }
  }
  const [branchOut, statusOut, sync] = await Promise.all([
    run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]),
    run("git", ["-C", dir, "status", "--porcelain"]),
    gitAheadBehind(dir)
  ]);
  const detached = branchOut?.trim() === "HEAD";
  const dirtyCount = statusOut == null ? 0 : statusOut.split("\n").filter((line) => line.trim().length > 0).length;
  const dirtySince = dirtyCount ? await dirtySinceMs(dir, statusOut) : null;
  const data = {
    available: true,
    days,
    total: days.reduce((sum, day) => sum + day.commits, 0),
    bestStreak,
    currentStreak,
    lastCommit,
    ahead: sync.ahead,
    behind: sync.behind,
    upstream: sync.upstream,
    dirtySince,
    detached
  };
  gitCache.set(dir, { at: Date.now(), data });
  return data;
}
var INBOX_TTL_MS = 60 * 1e3;
var INBOX_MAX = 1e3;
var inboxCache = null;
async function inboxPayload() {
  if (inboxCache && Date.now() - inboxCache.at < INBOX_TTL_MS) return inboxCache.data;
  const items = [];
  let available = false;
  const projects = await readLocalProjects();
  for (const project of projects) {
    if (!/^[A-Za-z0-9_-]{3,200}$/.test(project.id)) continue;
    const base = import_node_path.default.join(PROJECTS_DIR, project.id);
    const context = await readJson(import_node_path.default.join(base, "context.json"));
    if (!context) continue;
    available = true;
    const todos = Array.isArray(context.todos) ? context.todos : [];
    for (const todo of todos) {
      if (todo?.completed || typeof todo?.text !== "string" || !todo.text.trim()) continue;
      items.push({
        projectId: project.id,
        kind: "todo",
        text: String(todo.text).slice(0, 220),
        plan: null,
        planFile: null,
        createdAt: typeof todo.createdAt === "number" ? todo.createdAt : null
      });
      if (items.length >= INBOX_MAX) break;
    }
    if (items.length >= INBOX_MAX) break;
    const plans = Array.isArray(context.plans) ? context.plans : [];
    for (const plan of plans.slice(0, 60)) {
      const file = typeof plan?.file === "string" ? plan.file : null;
      if (!file) continue;
      const planPath = import_node_path.default.join(base, "plans", import_node_path.default.basename(file));
      const text = await readText(planPath, 3e5) ?? "";
      const stat = await import_node_fs.promises.stat(planPath).catch(() => null);
      const createdAt = typeof plan?.createdAt === "number" ? plan.createdAt : stat?.mtimeMs ? Math.round(stat.mtimeMs) : null;
      const title = typeof plan?.title === "string" && plan.title ? plan.title : file;
      for (const match of text.matchAll(/^[ \t]*[-*][ \t]+\[ \][ \t]*(.+?)[ \t]*$/gm)) {
        const step = (match[1] ?? "").replace(/^[#>*\s-]+/, "").trim();
        if (!step) continue;
        items.push({
          projectId: project.id,
          kind: "step",
          text: step.slice(0, 220),
          plan: title.slice(0, 160),
          planFile: import_node_path.default.basename(file),
          createdAt
        });
        if (items.length >= INBOX_MAX) break;
      }
      if (items.length >= INBOX_MAX) break;
    }
    if (items.length >= INBOX_MAX) break;
  }
  const truncated = items.length >= INBOX_MAX;
  const data = {
    available,
    items: truncated ? items.slice(0, INBOX_MAX) : items,
    counts: {
      todos: items.filter((item) => item.kind === "todo").length,
      steps: items.filter((item) => item.kind === "step").length
    },
    truncated
  };
  inboxCache = { at: Date.now(), data };
  return data;
}
var SPEND_TTL_MS = 5 * 60 * 1e3;
var spendCache = /* @__PURE__ */ new Map();
function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
async function spendFor(dir, days) {
  const key = `${dir}|${days}`;
  const cached = spendCache.get(key);
  if (cached && Date.now() - cached.at < SPEND_TTL_MS) return cached.data;
  const raw = await runStatsRaw(dir, days, ["--cost", "--models"]);
  if (!raw) {
    const data2 = {
      available: false,
      days,
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      sessions: 0,
      models: []
    };
    spendCache.set(key, { at: Date.now(), data: data2 });
    return data2;
  }
  const bucket = raw.tokens ?? {};
  const input = num(bucket.input);
  const output = num(bucket.output);
  const reasoning = num(bucket.reasoning);
  const cacheRead = num(bucket.cache?.read ?? bucket.cacheRead);
  const cacheWrite = num(bucket.cache?.write ?? bucket.cacheWrite);
  const total = input + output + reasoning + cacheRead + cacheWrite;
  const parsed = (Array.isArray(raw.models) ? raw.models : []).map((entry) => {
    const tokens = typeof entry?.tokens === "number" ? num(entry.tokens) : num(entry?.input) + num(entry?.output) + num(entry?.reasoning) + num(entry?.cache?.read) + num(entry?.cache?.write) + num(entry?.total);
    return {
      name: String(entry?.model ?? entry?.name ?? entry?.id ?? "unknown").slice(0, 80),
      tokens,
      cost: num(entry?.cost),
      share: 0
    };
  }).filter((model) => model.tokens > 0 || model.cost > 0).sort((a, b) => b.tokens - a.tokens);
  const modelTotal = parsed.reduce((sum, model) => sum + model.tokens, 0) || total;
  for (const model of parsed) model.share = modelTotal > 0 ? model.tokens / modelTotal : 0;
  const top = parsed.slice(0, 8);
  if (parsed.length > 8) {
    const rest = parsed.slice(8);
    const restTokens = rest.reduce((sum, model) => sum + model.tokens, 0);
    top.push({
      name: "other",
      tokens: restTokens,
      cost: rest.reduce((sum, model) => sum + model.cost, 0),
      share: modelTotal > 0 ? restTokens / modelTotal : 0
    });
  }
  const data = {
    available: true,
    days,
    cost: num(raw.cost),
    tokens: { input, output, reasoning, cacheRead, cacheWrite, total },
    sessions: num(raw.sessions),
    models: top
  };
  spendCache.set(key, { at: Date.now(), data });
  return data;
}
var DISK_TTL_MS = 12 * 60 * 60 * 1e3;
var diskCache = /* @__PURE__ */ new Map();
var DISK_CATEGORIES = [
  { id: "node_modules", label: "node_modules", dirs: ["node_modules"], reclaimable: true },
  { id: "vendor", label: "vendor", dirs: ["vendor"], reclaimable: true },
  { id: "git", label: ".git", dirs: [".git"], reclaimable: false },
  {
    id: "build",
    label: "Build output",
    dirs: ["dist", "build", ".next", ".nuxt", ".svelte-kit", ".turbo", "target", "out"],
    reclaimable: true
  },
  { id: "caches", label: "Caches", dirs: [".cache", "__pycache__", ".pytest_cache", ".gradle"], reclaimable: true },
  { id: "venvs", label: "Virtualenvs", dirs: [".venv", "venv"], reclaimable: true },
  { id: "source", label: "Source & assets", dirs: [], reclaimable: false }
];
var DISK_DIR_TO_CATEGORY = /* @__PURE__ */ new Map();
for (const category of DISK_CATEGORIES) {
  for (const dir of category.dirs) DISK_DIR_TO_CATEGORY.set(dir, category.id);
}
async function diskFor(dir, force) {
  const cached = diskCache.get(dir);
  if (!force && cached && Date.now() - cached.at < DISK_TTL_MS) return cached.data;
  const isDir = await import_node_fs.promises.stat(dir).then((stat) => stat.isDirectory()).catch(() => false);
  if (!isDir) return { available: false, total: 0, files: 0, truncated: false, categories: [], children: [], reclaimableBytes: 0 };
  const started = Date.now();
  let truncated = false;
  let fileCount = 0;
  const buckets = /* @__PURE__ */ new Map();
  for (const category of DISK_CATEGORIES) buckets.set(category.id, { bytes: 0, files: 0, top: [] });
  const topBytes = /* @__PURE__ */ new Map();
  const topIsDir = /* @__PURE__ */ new Set();
  const pending = [dir];
  while (pending.length) {
    if (Date.now() - started > MEASURE_BUDGET_MS) {
      truncated = true;
      break;
    }
    const current = pending.pop();
    if (!current) break;
    let entries;
    try {
      entries = await import_node_fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    const filePaths = [];
    for (const entry of entries) {
      const full = import_node_path.default.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        pending.push(full);
        if (current === dir) {
          topIsDir.add(entry.name);
          if (!topBytes.has(entry.name)) topBytes.set(entry.name, 0);
        }
      } else if (entry.isFile()) {
        filePaths.push(full);
      }
    }
    for (let index = 0; index < filePaths.length; index += 64) {
      const batch = filePaths.slice(index, index + 64);
      const stats = await Promise.all(batch.map((file) => import_node_fs.promises.stat(file).catch(() => null)));
      for (let slot = 0; slot < batch.length; slot += 1) {
        const stat = stats[slot];
        if (!stat?.isFile()) continue;
        fileCount += 1;
        const rel = import_node_path.default.relative(dir, batch[slot]);
        const segments = rel.split(import_node_path.default.sep);
        let categoryId = "source";
        for (const segment of segments) {
          const match = DISK_DIR_TO_CATEGORY.get(segment);
          if (match) {
            categoryId = match;
            break;
          }
        }
        const bucket = buckets.get(categoryId);
        if (bucket) {
          bucket.bytes += stat.size;
          bucket.files += 1;
          bucket.top.push({ rel, bytes: stat.size });
          if (bucket.top.length > 40) {
            bucket.top.sort((a, b) => b.bytes - a.bytes);
            bucket.top.length = 5;
          }
        }
        const top = segments[0];
        if (top) topBytes.set(top, (topBytes.get(top) ?? 0) + stat.size);
      }
    }
    if (fileCount > MEASURE_MAX_FILES) {
      truncated = true;
      break;
    }
  }
  let total = 0;
  const categories = DISK_CATEGORIES.map((category) => {
    const bucket = buckets.get(category.id);
    const bytes = bucket?.bytes ?? 0;
    total += bytes;
    const top = (bucket?.top ?? []).sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    return {
      id: category.id,
      label: category.label,
      bytes,
      files: bucket?.files ?? 0,
      reclaimable: category.reclaimable,
      paths: top.map((entry) => entry.rel)
    };
  }).filter((category) => category.files > 0 || category.id === "source");
  const children = [...topBytes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, bytes]) => ({ name, bytes, isDir: topIsDir.has(name) }));
  const reclaimableBytes = categories.filter((category) => category.reclaimable).reduce((sum, category) => sum + category.bytes, 0);
  const data = { available: true, total, files: fileCount, truncated, categories, children, reclaimableBytes };
  diskCache.set(dir, { at: Date.now(), data });
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
        const probed = await probeUrl(manual, force);
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
    if (req.method === "GET" && url.pathname === "/git") {
      const dir = safeDir(url.searchParams.get("directory"));
      if (!dir) return json(res, 400, { error: "bad directory" });
      return json(res, 200, await gitHistory(dir, url.searchParams.get("force") === "1"));
    }
    if (req.method === "GET" && url.pathname === "/inbox") {
      return json(res, 200, await inboxPayload());
    }
    if (req.method === "GET" && url.pathname === "/spend") {
      const dir = safeDir(url.searchParams.get("directory"));
      if (!dir) return json(res, 400, { error: "bad directory" });
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
      return json(res, 200, await spendFor(dir, days));
    }
    if (req.method === "GET" && url.pathname === "/disk") {
      const dir = safeDir(url.searchParams.get("directory"));
      if (!dir) return json(res, 400, { error: "bad directory" });
      return json(res, 200, await diskFor(dir, url.searchParams.get("force") === "1"));
    }
    if (req.method === "POST" && url.pathname === "/reveal") {
      const payload = JSON.parse(await readBody(req) || "{}");
      const dir = safeDir(payload.directory);
      if (!dir) return json(res, 400, { error: "bad directory" });
      let target = dir;
      if (payload.path != null) {
        if (typeof payload.path !== "string" || !payload.path || payload.path.includes("\0")) {
          return json(res, 400, { error: "bad path" });
        }
        if (import_node_path.default.isAbsolute(payload.path)) return json(res, 400, { error: "bad path" });
        const resolved = import_node_path.default.normalize(import_node_path.default.join(dir, payload.path));
        if (resolved !== dir && !resolved.startsWith(dir + import_node_path.default.sep)) {
          return json(res, 400, { error: "bad path" });
        }
        if (!await exists(resolved)) return json(res, 400, { error: "not found" });
        target = resolved;
      }
      return json(res, 200, { opened: reveal(target) });
    }
    if (req.method === "POST" && url.pathname === "/refresh") {
      const payload = JSON.parse(await readBody(req) || "{}");
      const dir = safeDir(payload.directory);
      if (!dir) return json(res, 400, { error: "bad directory" });
      factsCache.delete(dir);
      iconCache.delete(dir);
      gitCache.delete(dir);
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

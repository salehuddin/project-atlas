/**
 * Project Atlas local service.
 *
 * Runs as a guest service: OpenChamber spawns it with the app runtime, sets
 * OPENCHAMBER_SERVICE_PORT / OPENCHAMBER_SERVICE_TOKEN, and proxies the panel's
 * serviceRequest calls to it. Everything here is what a sandboxed page cannot
 * do on its own: recursive disk usage, git, deployment checks, favicons and
 * opening the file manager.
 *
 * Project icons come straight from OpenChamber's own settings.json and
 * project-icons folder, so they match the project list exactly.
 */
import http from "node:http";
import path from "node:path";
import tls from "node:tls";
import { execFile, spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { createHash } from "node:crypto";

const PORT = Number(process.env.OPENCHAMBER_SERVICE_PORT ?? 0);
const TOKEN = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
const HOME = process.env.USERPROFILE ?? process.env.HOME ?? "";

/** OpenChamber's own config: project list, colours and uploaded icons. */
const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, "openchamber")
  : path.join(HOME, ".config", "openchamber");
const SETTINGS_FILE = path.join(CONFIG_DIR, "settings.json");
const PROJECT_ICONS_DIR = path.join(CONFIG_DIR, "project-icons");
const PROJECTS_DIR = path.join(CONFIG_DIR, "projects");

const MEASURE_BUDGET_MS = 12_000;
const MEASURE_MAX_FILES = 300_000;
const SIZE_TTL_MS = 12 * 60 * 60 * 1000;
const FACTS_TTL_MS = 30_000;
const PROBE_TTL_MS = 10 * 60 * 1000;
const PROJECTS_TTL_MS = 2 * 60 * 1000;
const ICON_MAX_CHARS = 200_000;

type SizeInfo = {
  bytes: number | null;
  files: number | null;
  at: number | null;
  state: "none" | "running" | "ready";
  truncated: boolean;
};

type CertInfo = {
  validTo: number | null;
  daysLeft: number | null;
  issuer: string | null;
  authorized: boolean;
  error?: string;
};

type Deployment = {
  kind: string;
  label: string;
  url: string;
  source: string;
  live: boolean | null;
  status: number | null;
  ms: number | null;
  cert: CertInfo | null;
};

type Facts = {
  directory: string;
  shortPath: string;
  exists: boolean;
  branch: string | null;
  dirty: number | null;
  remote: string | null;
  web: string | null;
  site: string | null;
  stack: string[];
  kind: "repo" | "folder";
  deployments: Deployment[];
  ahead: number | null;
  behind: number | null;
  dirtySince: number | null;
  detached: boolean;
};

type GitDay = { date: string; commits: number };

type GitData = {
  available: boolean;
  days: GitDay[];
  total: number;
  bestStreak: number;
  currentStreak: number;
  lastCommit: { hash: string; subject: string; at: number } | null;
  ahead: number | null;
  behind: number | null;
  upstream: string | null;
  dirtySince: number | null;
  detached: boolean;
};

const factsCache = new Map<string, { at: number; data: Facts }>();
const sizes = new Map<string, SizeInfo>();
const iconCache = new Map<string, string | null>();
const localIconCache = new Map<string, string | null>();
const probeCache = new Map<string, { at: number; live: boolean | null; status: number | null; ms: number | null; cert: CertInfo | null }>();
const gitCache = new Map<string, { at: number; data: GitData }>();
const activityCache = new Map<string, { at: number; data: unknown }>();
const knowledgeCache = new Map<string, { at: number; data: unknown }>();
let projectsCache: { at: number; data: unknown } | null = null;
let localProjectsCache: { at: number; projects: LocalProject[] } | null = null;

/* ------------------------------------------------------------------ utils */

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 256_000) {
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

function safeDir(input: unknown): string | null {
  if (typeof input !== "string" || !input || input.includes("\0")) return null;
  if (!path.isAbsolute(input)) return null;
  return path.normalize(input);
}

function shortPath(dir: string): string {
  if (HOME && dir.toLowerCase().startsWith(HOME.toLowerCase())) {
    return `~${dir.slice(HOME.length)}`;
  }
  return dir;
}

async function run(bin: string, args: string[], cwd?: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { cwd, timeout: 8_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) resolve(null);
        else resolve(stdout.toString());
      },
    );
  });
}

async function readJson(file: string): Promise<any | null> {
  try {
    const raw = await fsp.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readText(file: string, limit = 64_000): Promise<string | null> {
  try {
    const raw = await fsp.readFile(file, "utf8");
    return raw.slice(0, limit);
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(raw: string | null | undefined): string | null {
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
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".test") ||
      host.endsWith(".localhost")
    ) {
      return null;
    }
    url.hash = "";
    const text = url.toString();
    return text.endsWith("/") ? text.slice(0, -1) : text;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ disk usage */

let measureChain: Promise<unknown> = Promise.resolve();

async function measure(root: string): Promise<{ bytes: number; files: number; truncated: boolean }> {
  const started = Date.now();
  let bytes = 0;
  let files = 0;
  let truncated = false;
  const pending: string[] = [root];

  while (pending.length) {
    if (Date.now() - started > MEASURE_BUDGET_MS) {
      truncated = true;
      break;
    }
    const dir = pending.pop();
    if (!dir) break;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const filePaths: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) filePaths.push(full);
    }
    for (let i = 0; i < filePaths.length; i += 64) {
      const batch = filePaths.slice(i, i + 64);
      const stats = await Promise.all(batch.map((p) => fsp.stat(p).catch(() => null)));
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

function enqueueMeasure(fn: () => Promise<void>): void {
  measureChain = measureChain.then(fn).catch(() => {});
}

function ensureSize(dir: string, force: boolean): SizeInfo {
  const current = sizes.get(dir);
  const now = Date.now();
  if (current) {
    if (current.state === "running") return current;
    if (!force && current.state === "ready" && current.at && now - current.at < SIZE_TTL_MS) {
      return current;
    }
  }

  const running: SizeInfo = {
    bytes: current?.bytes ?? null,
    files: current?.files ?? null,
    at: current?.at ?? null,
    state: "running",
    truncated: false,
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
        truncated: result.truncated,
      });
    } catch {
      sizes.set(dir, {
        bytes: current?.bytes ?? null,
        files: current?.files ?? null,
        at: current?.at ?? null,
        state: "ready",
        truncated: true,
      });
    }
  });

  return running;
}

/* --------------------------------------------------------------- icons */

const FAVICON_CANDIDATES = [
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
  "img/favicon.ico",
];

const MIME_BY_EXT: Record<string, string> = {
  ".ico": "image/vnd.microsoft.icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function faviconDataUrl(dir: string): Promise<string | null> {
  const cached = iconCache.get(dir);
  if (cached !== undefined) return cached;

  let result: string | null = null;
  for (const candidate of FAVICON_CANDIDATES) {
    const file = path.join(dir, candidate);
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size === 0 || stat.size > 200_000) continue;
    try {
      const buffer = await fsp.readFile(file);
      const mime = MIME_BY_EXT[path.extname(file).toLowerCase()] ?? "image/png";
      result = `data:${mime};base64,${buffer.toString("base64")}`;
      break;
    } catch {
      continue;
    }
  }

  iconCache.set(dir, result);
  return result;
}

type LocalProject = {
  id: string;
  path?: string;
  label?: string;
  color?: string;
  iconBackground?: string | null;
  icon?: string;
  iconImage?: { mime?: string; source?: string };
};

async function readLocalProjects(): Promise<LocalProject[]> {
  if (localProjectsCache && Date.now() - localProjectsCache.at < PROJECTS_TTL_MS) {
    return localProjectsCache.projects;
  }
  const data = await readJson(SETTINGS_FILE);
  const projects: LocalProject[] = Array.isArray(data?.projects)
    ? data.projects.filter((item: any) => item && typeof item.id === "string")
    : [];
  localProjectsCache = { at: Date.now(), projects };
  return projects;
}

/**
 * OpenChamber stores an uploaded project icon at
 * `project-<sha1(project id)>.<ext>` in project-icons. That is the exact image
 * the project list draws, so read it before anything else.
 */
async function localIcon(project: LocalProject): Promise<string | null> {
  if (localIconCache.has(project.id)) return localIconCache.get(project.id) ?? null;

  const hash = createHash("sha1").update(project.id).digest("hex");
  let result: string | null = null;

  for (const ext of ["png", "svg", "webp", "jpg", "jpeg", "gif"]) {
    const file = path.join(PROJECT_ICONS_DIR, `project-${hash}.${ext}`);
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size === 0 || stat.size > 512_000) continue;
    try {
      const buffer = await fsp.readFile(file);
      const mime =
        ext === "svg" ? "image/svg+xml" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      result = `data:${mime};base64,${buffer.toString("base64")}`;
      break;
    } catch {
      continue;
    }
  }

  localIconCache.set(project.id, result);
  return result;
}

function colorOf(project: LocalProject): string | null {
  for (const value of [project.iconBackground, project.color]) {
    if (typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value)) return value;
  }
  return null;
}

async function projectsPayload(): Promise<{ available: boolean; projects: unknown[] }> {
  const now = Date.now();
  if (projectsCache && now - projectsCache.at < PROJECTS_TTL_MS) return projectsCache.data as any;

  const local = await readLocalProjects();
  const projects: unknown[] = [];

  for (const project of local) {
    const directory = typeof project.path === "string" ? path.normalize(project.path) : null;
    const icon = (await localIcon(project)) ?? (directory ? await faviconDataUrl(directory) : null);
    projects.push({
      id: project.id,
      name: project.label ?? (directory ? path.basename(directory) : null),
      directory,
      icon,
      color: colorOf(project),
      symbol: project.icon ?? null,
    });
  }

  const data = { available: local.length > 0, projects };
  projectsCache = { at: now, data };
  return data;
}

/* --------------------------------------------------------- deployments */

/**
 * TLS details for an https deployment. Connects to host:443 with SNI and a
 * short timeout, with verification off so expired or self-signed certs are
 * reported instead of failing. Never throws; null when unavailable.
 */
async function checkTls(host: string): Promise<CertInfo | null> {
  return new Promise((resolve) => {
    let done = false;
    let socket: tls.TLSSocket | null = null;
    const finish = (value: CertInfo | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
        /* already gone */
      }
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish({ validTo: null, daysLeft: null, issuer: null, authorized: false, error: "timeout" });
    }, 4_000);
    try {
      socket = tls.connect(
        { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 4_000 },
        () => {
          try {
            const peer = socket?.getPeerCertificate() as
              | { valid_to?: string; issuer?: Record<string, string> }
              | null;
            const current = socket;
            const authorized = current?.authorized ?? false;
            const authError = current?.authorizationError ?? null;
            if (!peer || !peer.valid_to) {
              finish(null);
              return;
            }
            const validTo = Date.parse(peer.valid_to);
            const info: CertInfo = {
              validTo: Number.isNaN(validTo) ? null : validTo,
              daysLeft: Number.isNaN(validTo) ? null : Math.floor((validTo - Date.now()) / 86_400_000),
              issuer: peer.issuer?.CN ?? peer.issuer?.O ?? null,
              authorized,
            };
            if (authError) info.error = String(authError);
            finish(info);
          } catch {
            finish(null);
          }
        },
      );
      socket.on("error", () => {
        finish({ validTo: null, daysLeft: null, issuer: null, authorized: false, error: "unreachable" });
      });
    } catch {
      finish(null);
    }
  });
}

async function probeUrl(
  url: string,
  force = false,
): Promise<{ live: boolean | null; status: number | null; ms: number | null; cert: CertInfo | null }> {
  const cached = probeCache.get(url);
  if (!force && cached && Date.now() - cached.at < PROBE_TTL_MS) {
    return { live: cached.live, status: cached.status, ms: cached.ms, cert: cached.cert };
  }

  const started = Date.now();
  let live: boolean | null = null;
  let status: number | null = null;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(4_500),
      headers: {
        "user-agent": "ProjectAtlas/0.5 (OpenChamber extension)",
        accept: "text/html,application/xhtml+xml,*/*;q=0.5",
      },
    });
    status = response.status;
    live = response.status < 400;
    try {
      await response.body?.cancel();
    } catch {
      /* body already gone */
    }
  } catch {
    live = false;
    status = null;
  }
  const ms = Date.now() - started;

  let cert: CertInfo | null = null;
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

type Candidate = { kind: string; label: string; url: string; source: string };

function labelForKey(key: string): string {
  const upper = key.toUpperCase();
  if (upper.includes("API")) return "API";
  if (upper.includes("FRONT")) return "Frontend";
  if (upper.includes("ADMIN")) return "Admin";
  if (upper.includes("APP")) return "App";
  if (upper.includes("WP")) return "Site";
  return "Site";
}

function pushCandidate(list: Candidate[], candidate: Candidate): void {
  const url = normalizeUrl(candidate.url);
  if (!url) return;
  if (list.some((item) => item.url === url)) return;
  list.push({ ...candidate, url });
}

async function envCandidates(dir: string, list: Candidate[]): Promise<void> {
  for (const name of [".env", ".env.local", ".env.production", ".env.prod"]) {
    const text = await readText(path.join(dir, name), 20_000);
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
        source: `${name} ${key}`,
      });
    }
  }
}

function isRepoUrl(url: string): boolean {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return (
      host === "github.com" ||
      host === "gitlab.com" ||
      host === "bitbucket.org" ||
      host === "codeberg.org"
    );
  } catch {
    return false;
  }
}

async function detectDeployments(
  dir: string,
  pkg: any,
  composer: any,
  remote: string | null,
): Promise<Candidate[]> {
  const list: Candidate[] = [];

  for (const candidate of ["public/CNAME", "CNAME", "static/CNAME"]) {
    const text = await readText(path.join(dir, candidate), 512);
    const host = text?.trim().split(/\s+/)[0];
    if (host) {
      pushCandidate(list, { kind: "domain", label: "Live", url: host, source: candidate });
    }
  }

  for (const [value, source] of [
    [pkg?.homepage, "package.json homepage"],
    [composer?.homepage, "composer.json homepage"],
  ] as const) {
    if (typeof value === "string" && !isRepoUrl(value)) {
      pushCandidate(list, { kind: "homepage", label: "Homepage", url: value, source });
    }
  }

  await envCandidates(dir, list);

  const fly = await readText(path.join(dir, "fly.toml"), 8_000);
  const flyApp = fly?.match(/^\s*app\s*=\s*"([^"]+)"/m)?.[1];
  if (flyApp) {
    pushCandidate(list, { kind: "fly", label: "Fly", url: `https://${flyApp}.fly.dev`, source: "fly.toml" });
  }

  const wrangler = await readText(path.join(dir, "wrangler.toml"), 8_000);
  const worker = wrangler?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
  if (worker && /pages_build_output_dir|\[\[pages\]\]/i.test(wrangler ?? "")) {
    pushCandidate(list, {
      kind: "cloudflare",
      label: "Pages",
      url: `https://${worker}.pages.dev`,
      source: "wrangler.toml",
    });
  }

  const firebase = await readJson(path.join(dir, ".firebaserc"));
  const firebaseId = firebase?.projects?.default;
  if (typeof firebaseId === "string") {
    pushCandidate(list, {
      kind: "firebase",
      label: "Firebase",
      url: `https://${firebaseId}.web.app`,
      source: ".firebaserc",
    });
  }

  const render = await readText(path.join(dir, "render.yaml"), 8_000);
  const renderName = render?.match(/^\s*-\s*type:\s*web[\s\S]*?^\s*name:\s*([A-Za-z0-9-]+)/m)?.[1];
  if (renderName) {
    pushCandidate(list, {
      kind: "render",
      label: "Render",
      url: `https://${renderName}.onrender.com`,
      source: "render.yaml",
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
            source: "gh-pages branch",
          });
        }
      }
    }
  }

  return list;
}

async function buildDeployments(
  dir: string,
  pkg: any,
  composer: any,
  remote: string | null,
  force: boolean,
): Promise<Deployment[]> {
  const candidates = (await detectDeployments(dir, pkg, composer, remote)).slice(0, 4);
  return Promise.all(
    candidates.map(async (candidate) => ({ ...candidate, ...(await probeUrl(candidate.url, force)) })),
  );
}

/* ------------------------------------------------------ git sync state */

/**
 * Cheap sync state for cards: upstream tracking branch plus how far HEAD is
 * ahead/behind. Nulls when there is no upstream; never throws.
 */
async function gitAheadBehind(dir: string): Promise<{ ahead: number | null; behind: number | null; upstream: string | null }> {
  const upstream = (await run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]))?.trim();
  if (!upstream) return { ahead: null, behind: null, upstream: null };
  const counts = (await run("git", ["-C", dir, "rev-list", "--left-right", "--count", "@{u}...HEAD"]))?.trim();
  const match = counts?.match(/^(\d+)\s+(\d+)$/);
  if (!match) return { ahead: null, behind: null, upstream };
  return { ahead: Number(match[2]), behind: Number(match[1]), upstream };
}

/**
 * Oldest mtime among the files `git status --porcelain` reports as changed.
 * Capped at 100 stats so a huge dirty tree stays cheap; null when clean.
 */
async function dirtySinceMs(dir: string, statusOut: string | null): Promise<number | null> {
  if (!statusOut) return null;
  const files: string[] = [];
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
  let oldest: number | null = null;
  for (const file of files) {
    const stat = await fsp.stat(path.join(dir, file)).catch(() => null);
    const mtime = stat?.mtimeMs ?? null;
    if (mtime != null && (oldest == null || mtime < oldest)) oldest = mtime;
  }
  return oldest;
}

/* --------------------------------------------------------------- facts */

function webFromRemote(remote: string | null): string | null {
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

async function detectSite(dir: string, pkg: any, composer: any): Promise<string | null> {
  for (const candidate of ["public/CNAME", "CNAME", "static/CNAME"]) {
    const text = await readText(path.join(dir, candidate), 512);
    const host = text?.trim().split(/\s+/)[0];
    if (host && host.includes(".") && !host.startsWith("#")) return `https://${host}`;
  }
  for (const value of [pkg?.homepage, composer?.homepage]) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

async function detectStack(dir: string, pkg: any, composer: any): Promise<string[]> {
  const stack: string[] = [];
  const add = (label: string) => {
    if (label && !stack.includes(label) && stack.length < 7) stack.push(label);
  };

  if (pkg) add("Node");
  if (composer) add("PHP");

  const deps = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
    ...(pkg?.peerDependencies ?? {}),
  } as Record<string, unknown>;
  const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);
  const php = { ...(composer?.require ?? {}), ...(composer?.["require-dev"] ?? {}) } as Record<string, unknown>;
  const hasPhp = (name: string) => Object.prototype.hasOwnProperty.call(php, name);

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

  const checks: Array<[string, string]> = [
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
    ["turbo.json", "Turborepo"],
  ];
  const found = await Promise.all(checks.map(async ([file, label]) => ((await exists(path.join(dir, file))) ? label : null)));
  for (const label of found) if (label) add(label);

  const managers: Array<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lockb", "Bun"],
    ["bun.lock", "Bun"],
    ["yarn.lock", "Yarn"],
    ["package-lock.json", "npm"],
    ["composer.lock", "Composer"],
  ];
  const manager = await Promise.all(managers.map(async ([file, label]) => ((await exists(path.join(dir, file))) ? label : null)));
  for (const label of manager) {
    if (label) {
      add(label);
      break;
    }
  }

  return stack;
}

async function collectFacts(dir: string, force: boolean): Promise<Facts> {
  const cached = factsCache.get(dir);
  if (!force && cached && Date.now() - cached.at < FACTS_TTL_MS) return cached.data;

  const isDir = await fsp
    .stat(dir)
    .then((stat) => stat.isDirectory())
    .catch(() => false);

  const base: Facts = {
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
    detached: false,
  };

  if (!isDir) {
    const result = { ...base };
    factsCache.set(dir, { at: Date.now(), data: result });
    return result;
  }

  const [branchOut, statusOut, remoteOut, upstreamOut, aheadBehindOut, pkg, composer] = await Promise.all([
    run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]),
    run("git", ["-C", dir, "status", "--porcelain"]),
    run("git", ["-C", dir, "config", "--get", "remote.origin.url"]),
    run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    run("git", ["-C", dir, "rev-list", "--left-right", "--count", "@{u}...HEAD"]),
    readJson(path.join(dir, "package.json")),
    readJson(path.join(dir, "composer.json")),
  ]);

  let branch = branchOut?.trim() || null;
  const detached = branch === "HEAD";
  if (detached) {
    const sha = (await run("git", ["-C", dir, "rev-parse", "--short", "HEAD"]))?.trim();
    branch = sha ? `detached@${sha}` : "detached";
  }

  const dirty = statusOut == null ? null : statusOut.split("\n").filter((line) => line.trim().length > 0).length;
  const remote = remoteOut?.trim() || null;

  let ahead: number | null = null;
  let behind: number | null = null;
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
    buildDeployments(dir, pkg, composer, remote, force),
  ]);

  const result: Facts = {
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
    detached,
  };
  factsCache.set(dir, { at: Date.now(), data: result });
  return result;
}

/* --------------------------------------------------------------- readme */

async function readmeFor(dir: string): Promise<{ text: string; hash: string; name: string | null }> {
  const names = ["README.md", "readme.md", "README.MD", "README.markdown", "README.txt", "README"];
  for (const name of names) {
    const file = path.join(dir, name);
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat?.isFile()) continue;
    const text = (await fsp.readFile(file, "utf8").catch(() => "")).slice(0, 8_000);
    const hash = createHash("sha1").update(text).update(String(stat.mtimeMs)).digest("hex").slice(0, 16);
    return { text, hash, name };
  }
  return { text: "", hash: "", name: null };
}

/* ------------------------------------------------------------- activity */

const ACTIVITY_TTL_MS = 2 * 60 * 1000;
const KNOWLEDGE_TTL_MS = 60 * 1000;

function dateKey(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fillDays(
  activity: Array<{ date?: string; steps?: number }>,
  range: { from?: number; to?: number } | undefined,
  days: number,
): Array<{ date: string; steps: number }> {
  const steps = new Map<string, number>();
  for (const entry of activity) {
    if (typeof entry?.date === "string") steps.set(entry.date, Number(entry.steps) || 0);
  }

  const end = new Date(range?.to ?? Date.now());
  const start = new Date(range?.from ?? end.getTime() - (days - 1) * 86_400_000);
  start.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);

  const points: Array<{ date: string; steps: number }> = [];
  const cursor = new Date(start);
  while (cursor <= end && points.length < 400) {
    const key = dateKey(cursor.getTime());
    points.push({ date: key, steps: steps.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

function cliCandidates(): string[] {
  const list: string[] = [];
  if (process.env.OPENCHAMBER_OPENCODE_CLI) list.push(process.env.OPENCHAMBER_OPENCODE_CLI);
  list.push("opencode");
  const dir = path.dirname(process.execPath);
  list.push(path.join(dir, "resources", "opencode-cli", "opencode.exe"));
  list.push(path.join(dir, "opencode-cli", "opencode.exe"));
  return list;
}

async function runStats(dir: string, days: number): Promise<any | null> {
  for (const bin of cliCandidates()) {
    const stdout = await new Promise<string | null>((resolve) => {
      execFile(
        bin,
        ["stats", "--json", "--full", "--days", String(days), "--project", "."],
        { cwd: dir, timeout: 25_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
        (error, out) => resolve(error ? null : out.toString()),
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

async function activityFor(dir: string, days: number): Promise<any> {
  const key = `${dir}|${days}`;
  const cached = activityCache.get(key);
  if (cached && Date.now() - cached.at < ACTIVITY_TTL_MS) return cached.data;

  const raw = await runStats(dir, days);
  const data = raw
    ? {
        available: true,
        days,
        sessions: Number(raw.sessions) || 0,
        prompts: Number(raw.prompts) || 0,
        steps: Number(raw.steps) || 0,
        activeDays: Number(raw.activeDays) || 0,
        streak: Number(raw.streak) || 0,
        cost: Number(raw.cost) || 0,
        points: fillDays(Array.isArray(raw.activity) ? raw.activity : [], raw.range, days),
      }
    : {
        available: false,
        days,
        sessions: 0,
        prompts: 0,
        steps: 0,
        activeDays: 0,
        streak: 0,
        cost: 0,
        points: fillDays([], undefined, days),
      };

  activityCache.set(key, { at: Date.now(), data });
  return data;
}

async function knowledgeFor(projectId: string): Promise<any> {
  const empty = {
    available: false,
    openTodos: 0,
    doneTodos: 0,
    todos: [] as unknown[],
    plans: [] as unknown[],
    notes: 0,
  };
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(projectId)) return empty;

  const cached = knowledgeCache.get(projectId);
  if (cached && Date.now() - cached.at < KNOWLEDGE_TTL_MS) return cached.data;

  const base = path.join(PROJECTS_DIR, projectId);
  const context = await readJson(path.join(base, "context.json"));
  if (!context) {
    knowledgeCache.set(projectId, { at: Date.now(), data: empty });
    return empty;
  }

  const todos: any[] = Array.isArray(context.todos) ? context.todos : [];
  const plans: any[] = Array.isArray(context.plans) ? context.plans : [];
  const notes: any[] = Array.isArray(context.notes) ? context.notes : [];
  const planInfos: any[] = [];

  for (const plan of plans.slice(0, 60)) {
    const file = typeof plan?.file === "string" ? plan.file : null;
    if (!file) continue;
    const text = (await readText(path.join(base, "plans", path.basename(file)), 300_000)) ?? "";
    const boxes = text.match(/^[ \t]*[-*][ \t]+\[( |x|X)\]/gm) ?? [];
    const done = boxes.filter((box) => /\[[xX]\]/.test(box)).length;
    planInfos.push({
      id: plan.id ?? file,
      title: typeof plan.title === "string" ? plan.title : file,
      file,
      total: boxes.length,
      done,
      open: boxes.length - done,
      createdAt: plan.createdAt ?? null,
    });
  }
  planInfos.sort((a, b) => b.open - a.open || b.total - a.total);

  const data = {
    available: true,
    openTodos: todos.filter((todo) => !todo?.completed).length,
    doneTodos: todos.filter((todo) => todo?.completed).length,
    todos: todos
      .filter((todo) => !todo?.completed)
      .slice(0, 8)
      .map((todo) => ({ text: String(todo.text ?? "").slice(0, 220), createdAt: todo.createdAt ?? null })),
    plans: planInfos,
    notes: notes.length,
  };

  knowledgeCache.set(projectId, { at: Date.now(), data });
  return data;
}

/* ------------------------------------------------------------ git history */

const GIT_TTL_MS = 2 * 60 * 1000;
const GIT_DAYS = 182;

/**
 * Commit heatmap for one repo: per-day counts for the last 182 days
 * (gap-filled), streaks, the last commit and the sync state. Non-repo
 * folders answer `available: false`; everything degrades to nulls, never
 * throws.
 */
async function gitHistory(dir: string, force: boolean): Promise<GitData> {
  const cached = gitCache.get(dir);
  if (!force && cached && Date.now() - cached.at < GIT_TTL_MS) return cached.data;

  const empty = (partial: Partial<GitData> = {}): GitData => ({
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
    ...partial,
  });

  const gitDir = await run("git", ["-C", dir, "rev-parse", "--git-dir"]);
  if (gitDir == null) {
    const data = empty();
    gitCache.set(dir, { at: Date.now(), data });
    return data;
  }

  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end.getTime() - (GIT_DAYS - 1) * 86_400_000);
  const since = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;

  const counts = new Map<string, number>();
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
    "50000",
  ]);
  if (log) {
    for (const line of log.split("\n")) {
      const date = line.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }

  const days: GitDay[] = [];
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

  let lastCommit: GitData["lastCommit"] = null;
  const last = await run("git", ["-C", dir, "log", "-1", "--pretty=format:%H%x1f%s%x1f%at"]);
  if (last) {
    const [hash, subject, at] = last.split("\x1f");
    if (hash && at && /^\d+$/.test(at.trim())) {
      lastCommit = { hash: hash.trim().slice(0, 7), subject: (subject ?? "").trim().slice(0, 160), at: Number(at.trim()) * 1000 };
    }
  }

  const [branchOut, statusOut, sync] = await Promise.all([
    run("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"]),
    run("git", ["-C", dir, "status", "--porcelain"]),
    gitAheadBehind(dir),
  ]);
  const detached = branchOut?.trim() === "HEAD";
  const dirtyCount = statusOut == null ? 0 : statusOut.split("\n").filter((line) => line.trim().length > 0).length;
  const dirtySince = dirtyCount ? await dirtySinceMs(dir, statusOut) : null;

  const data: GitData = {
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
    detached,
  };
  gitCache.set(dir, { at: Date.now(), data });
  return data;
}

function reveal(dir: string): boolean {
  const [bin, args] =
    process.platform === "win32"
      ? ["explorer.exe", [dir]]
      : process.platform === "darwin"
        ? ["open", [dir]]
        : ["xdg-open", [dir]];
  try {
    const child = spawn(bin, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
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
          ...deployments.filter((item) => item.url !== manual),
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

    if (req.method === "POST" && url.pathname === "/reveal") {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const dir = safeDir(payload.directory);
      if (!dir) return json(res, 400, { error: "bad directory" });
      return json(res, 200, { opened: reveal(dir) });
    }

    if (req.method === "POST" && url.pathname === "/refresh") {
      const payload = JSON.parse((await readBody(req)) || "{}");
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
  // The host polls /health; nothing else is printed, stdout is not a channel.
});

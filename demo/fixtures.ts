/**
 * Invented projects for the demo harness. Every name, path, URL, plan and
 * number below is made up; the activity series is generated from a fixed seed
 * so the screenshots are reproducible.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------- icons */

function icon(from: string, to: string, glyph: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="14" fill="url(#g)"/>${glyph}</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const ICONS = {
  lumen: icon(
    "#ffb347",
    "#ff6a1a",
    `<path d="M13 41a19 19 0 0 1 38 0z" fill="#fff"/><path d="M20 41v-7M32 41V30M44 41v-7" stroke="#ff8a3a" stroke-width="3" stroke-linecap="round"/><rect x="13" y="43" width="38" height="5" rx="2.5" fill="#fff" opacity=".85"/>`,
  ),
  orbit: icon(
    "#7b7bff",
    "#3a2fd1",
    `<ellipse cx="32" cy="32" rx="23" ry="9" fill="none" stroke="#fff" stroke-width="4" transform="rotate(-28 32 32)"/><circle cx="32" cy="32" r="8" fill="#fff"/>`,
  ),
  fieldnotes: icon(
    "#4ed39a",
    "#12805a",
    `<rect x="17" y="12" width="30" height="40" rx="4" fill="#fff"/><path d="M23 24h18M23 32h18M23 40h11" stroke="#1c9a6e" stroke-width="3" stroke-linecap="round"/>`,
  ),
  paperkite: icon(
    "#5fd4f4",
    "#1778c9",
    `<path d="M32 10 51 30 32 54 13 30z" fill="#fff"/><path d="M32 10v44M13 30h38" stroke="#3d9ce0" stroke-width="2.5"/><path d="M32 54c-2 4 3 6 0 9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  ),
  tidepool: icon(
    "#4aa8ff",
    "#0a4fa8",
    `<path d="M10 28c7-8 12 8 22 0s15 8 22 0M10 40c7-8 12 8 22 0s15 8 22 0" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>`,
  ),
};

/* ---------------------------------------------------------- projects */

type DemoCert = {
  validTo: number | null;
  daysLeft: number | null;
  issuer: string | null;
  authorized: boolean;
  error?: string;
} | null;

type DemoDeployment = {
  label: string;
  url: string;
  source: string;
  live: boolean | null;
  status: number | null;
  ms: number | null;
  cert: DemoCert;
};

type DemoProject = {
  id: string;
  name: string;
  directory: string;
  shortPath: string;
  icon: string | null;
  color: string | null;
  group: string | null;
  pinned: boolean;
  summary: string;
  branch: string;
  dirty: number;
  dirtyDays: number | null;
  ahead: number;
  behind: number;
  detached: boolean;
  web: string | null;
  stack: string[];
  bytes: number;
  files: number;
  deployments: DemoDeployment[];
  chats: number;
  worktrees: number;
  session: {
    title: string;
    ageHours: number;
    activity: string;
    unread?: boolean;
    outcome?: "completed" | "failed";
  } | null;
};

const base = "C:\\Users\\demo\\projects\\";

export const PROJECTS: DemoProject[] = [
  {
    id: "demo_lumen",
    name: "Lumen Bakery",
    directory: `${base}lumen-bakery`,
    shortPath: "~\\projects\\lumen-bakery",
    icon: ICONS.lumen,
    color: "#ff8a3a",
    group: null,
    pinned: true,
    summary:
      "Storefront and pickup scheduling for a neighbourhood bakery. Next.js with Stripe checkout, deployed to Vercel from main.",
    branch: "main",
    dirty: 3,
    dirtyDays: 5,
    ahead: 2,
    behind: 0,
    detached: false,
    web: "https://github.com/demo/lumen-bakery",
    stack: ["Next.js", "TypeScript", "Stripe", "Vercel", "pnpm"],
    bytes: 412 * 1024 * 1024,
    files: 18_240,
    deployments: [
      {
        label: "Production",
        url: "https://lumenbakery.example",
        source: "vercel.json",
        live: true,
        status: 200,
        ms: 180,
        cert: { validTo: Date.now() + 9 * DAY, daysLeft: 9, issuer: "Example CA", authorized: true },
      },
      {
        label: "Preview",
        url: "https://lumen-bakery-git-next.example",
        source: ".env",
        live: true,
        status: 200,
        ms: 240,
        cert: { validTo: Date.now() + 120 * DAY, daysLeft: 120, issuer: "Example CA", authorized: true },
      },
    ],
    chats: 14,
    worktrees: 2,
    session: { title: "Add pickup slot picker", ageHours: 0.1, activity: "running" },
  },
  {
    id: "demo_orbit",
    name: "Orbit CRM",
    directory: `${base}orbit-crm`,
    shortPath: "~\\projects\\orbit-crm",
    icon: ICONS.orbit,
    color: "#5b5bd6",
    group: "Clients",
    pinned: false,
    summary:
      "Lightweight CRM for small agencies with pipelines, reminders and an email inbox. Laravel API behind a Vue single-page app, shipped with Docker on Fly.io.",
    branch: "feat/reminders",
    dirty: 11,
    dirtyDays: 4,
    ahead: 0,
    behind: 1,
    detached: false,
    web: "https://github.com/demo/orbit-crm",
    stack: ["Laravel", "PHP", "Vue", "Docker", "Fly.io"],
    bytes: 1.6 * 1024 * 1024 * 1024,
    files: 41_870,
    deployments: [
      {
        label: "App",
        url: "https://app.orbitcrm.example",
        source: "fly.toml",
        live: true,
        status: 200,
        ms: 310,
        cert: { validTo: Date.now() + 45 * DAY, daysLeft: 45, issuer: "Example CA", authorized: true },
      },
      {
        label: "Docs",
        url: "https://docs.orbitcrm.example",
        source: "CNAME",
        live: true,
        status: 200,
        ms: 150,
        cert: { validTo: Date.now() + 200 * DAY, daysLeft: 200, issuer: "Example CA", authorized: true },
      },
    ],
    chats: 31,
    worktrees: 1,
    session: { title: "Migrate reminders to queued jobs", ageHours: 0.5, activity: "waiting-permission" },
  },
  {
    id: "demo_tidepool",
    name: "Tidepool API",
    directory: `${base}tidepool-api`,
    shortPath: "~\\projects\\tidepool-api",
    icon: ICONS.tidepool,
    color: "#2f7fe0",
    group: "Clients",
    pinned: false,
    summary:
      "Tide and weather data service for harbour apps. A Go REST API backed by PostgreSQL, running on Render with nightly data imports.",
    branch: "main",
    dirty: 0,
    dirtyDays: null,
    ahead: 0,
    behind: 0,
    detached: false,
    web: "https://github.com/demo/tidepool-api",
    stack: ["Go", "PostgreSQL", "Docker", "Render"],
    bytes: 96 * 1024 * 1024,
    files: 2_104,
    deployments: [
      {
        label: "API",
        url: "https://api.tidepool.example",
        source: "render.yaml",
        live: true,
        status: 200,
        ms: 95,
        cert: { validTo: Date.now() + 200 * DAY, daysLeft: 200, issuer: "Example CA", authorized: true },
      },
    ],
    chats: 9,
    worktrees: 0,
    session: { title: "Cache station lookups", ageHours: 3, activity: "idle", unread: true },
  },
  {
    id: "demo_fieldnotes",
    name: "Fieldnotes",
    directory: `${base}fieldnotes`,
    shortPath: "~\\projects\\fieldnotes",
    icon: ICONS.fieldnotes,
    color: "#1c9a6e",
    group: "Personal",
    pinned: false,
    summary:
      "Offline-first field notebook for surveyors, syncing photos and GPS tags when a connection returns. React Native with an Expo build pipeline.",
    branch: "release/1.4",
    dirty: 0,
    dirtyDays: null,
    ahead: 0,
    behind: 0,
    detached: false,
    web: "https://github.com/demo/fieldnotes",
    stack: ["React Native", "Expo", "TypeScript", "SQLite"],
    bytes: 733 * 1024 * 1024,
    files: 27_551,
    deployments: [],
    chats: 22,
    worktrees: 0,
    session: { title: "Fix photo upload retries", ageHours: 26, activity: "idle", outcome: "failed" },
  },
  {
    id: "demo_paperkite",
    name: "Paperkite Docs",
    directory: `${base}paperkite-docs`,
    shortPath: "~\\projects\\paperkite-docs",
    icon: ICONS.paperkite,
    color: "#2b8bd6",
    group: "Personal",
    pinned: false,
    summary:
      "Documentation site for the Paperkite design system, with live component previews. Astro and MDX, published to Cloudflare Pages.",
    branch: "main",
    dirty: 1,
    dirtyDays: 1,
    ahead: 0,
    behind: 0,
    detached: false,
    web: "https://github.com/demo/paperkite-docs",
    stack: ["Astro", "MDX", "Cloudflare", "npm"],
    bytes: 188 * 1024 * 1024,
    files: 9_332,
    deployments: [
      {
        label: "Docs",
        url: "https://paperkite.example",
        source: "wrangler.toml",
        live: true,
        status: 200,
        ms: 150,
        cert: { validTo: Date.now() + 60 * DAY, daysLeft: 60, issuer: "Example CA", authorized: true },
      },
      {
        label: "Staging",
        url: "https://staging.paperkite.example",
        source: ".env",
        live: false,
        status: null,
        ms: null,
        cert: null,
      },
    ],
    chats: 6,
    worktrees: 0,
    session: { title: "Document the Tooltip component", ageHours: 52, activity: "idle" },
  },
  {
    id: "demo_northwind",
    name: "Northwind Studio",
    directory: `${base}northwind-studio`,
    shortPath: "~\\projects\\northwind-studio",
    icon: null,
    color: "#8e4ec6",
    group: "Clients",
    pinned: false,
    summary:
      "Marketing site for a design studio, built as a custom WordPress theme with a small block library. Deployed by SFTP to shared hosting.",
    branch: "main",
    dirty: 0,
    dirtyDays: null,
    ahead: 0,
    behind: 0,
    detached: false,
    web: null,
    stack: ["WordPress", "PHP", "Tailwind"],
    bytes: 64 * 1024 * 1024,
    files: 1_873,
    deployments: [],
    chats: 0,
    worktrees: 0,
    session: null,
  },
];

export const DEMO_DIRECTORY = PROJECTS[0].directory;

/** Pre-written blurbs, so the demo never needs a model. */
export const DEMO_SUMMARY_KEYS: Array<[string, unknown]> = PROJECTS.map((project) => [
  `atlas:v1:summary:${project.id}`,
  { text: project.summary, hash: "demo", at: Date.now() },
]);

/** Pre-seeded pins and groups, so the board demo shows sections on first load. */
export const DEMO_META_KEYS: Array<[string, unknown]> = PROJECTS.filter(
  (project) => project.pinned || project.group,
).map((project) => [
  `atlas:v1:meta:${project.id}`,
  { pinned: project.pinned, group: project.group, hidden: false },
]);

/** Pre-seeded probe histories, so the Deployments panel demo has dots on first load. */
export const DEMO_PROBE_KEYS: Array<[string, unknown]> = [
  [
    `atlas:v1:probes:demo_lumen`,
    {
      "https://lumenbakery.example": probeSeries(15, true, 180),
      "https://lumen-bakery-git-next.example": probeSeries(8, true, 240),
    },
  ],
  [
    `atlas:v1:probes:demo_orbit`,
    { "https://app.orbitcrm.example": probeSeries(12, true, 310, 5) },
  ],
  [
    `atlas:v1:probes:demo_paperkite`,
    {
      "https://paperkite.example": probeSeries(10, true, 150),
      "https://staging.paperkite.example": probeSeries(9, false, 0),
    },
  ],
];

/** Invented check history: `failAt` flips one middle entry to down for variety. */
function probeSeries(count: number, live: boolean, ms: number, failAt = -1) {
  const entries = [];
  for (let index = count; index >= 1; index -= 1) {
    const down = live ? index === failAt : index <= 3;
    entries.push({ at: Date.now() - index * 11 * 60_000, live: !down, ms: down ? null : ms });
  }
  return entries;
}

/* --------------------------------------------------------- host data */

export function listProjects() {
  return { state: "ready", projects: PROJECTS.map(({ id, name, directory }) => ({ id, name, directory })) };
}

export function listSessions(projectId: string) {
  const project = PROJECTS.find((item) => item.id === projectId);
  const sessions = [];
  if (project?.session) {
    const { session } = project;
    sessions.push({
      id: `${project.id}_last`,
      title: session.title,
      updatedAt: Date.now() - session.ageHours * HOUR,
      activity: session.activity,
      outcome: session.outcome ?? "completed",
      archivedAt: null,
      unread: Boolean(session.unread),
      parentId: null,
    });
    for (let index = 1; index < project.chats; index += 1) {
      sessions.push({
        id: `${project.id}_${index}`,
        title: `Earlier chat ${index}`,
        updatedAt: Date.now() - (session.ageHours + index * 20) * HOUR,
        activity: "idle",
        outcome: "completed",
        archivedAt: null,
        unread: false,
        parentId: null,
      });
    }
  }
  return { state: "ready", coverage: [], sessions };
}

export function listWorktrees(projectId: string) {
  const project = PROJECTS.find((item) => item.id === projectId);
  const worktrees = Array.from({ length: project?.worktrees ?? 0 }, (_, index) => ({
    directory: `${project?.directory}-wt${index + 1}`,
    name: `wt${index + 1}`,
    branch: `feature/${index + 1}`,
    status: "ready",
  }));
  return { state: "ready", worktrees };
}

/* ------------------------------------------------------ local service */

function byDirectory(directory: string | undefined): DemoProject | undefined {
  return PROJECTS.find((item) => item.directory === directory);
}

function json(value: unknown) {
  return { status: 200, headers: {}, body: JSON.stringify(value) };
}

export function handleService(path: string, query: Record<string, string>) {
  switch (path) {
    case "/projects":
      return json({
        available: true,
        projects: PROJECTS.map((item) => ({
          id: item.id,
          directory: item.directory,
          icon: item.icon,
          color: item.color,
        })),
      });

    case "/vitals": {
      const project = byDirectory(query.directory);
      if (!project) return { status: 404, headers: {}, body: "{}" };
      return json({
        directory: project.directory,
        shortPath: project.shortPath,
        exists: true,
        branch: project.branch,
        dirty: project.dirty,
        remote: project.web ? `${project.web}.git` : null,
        web: project.web,
        site: project.deployments[0]?.url ?? null,
        stack: project.stack,
        kind: "repo",
        ahead: project.ahead,
        behind: project.behind,
        dirtySince: project.dirtyDays == null ? null : Date.now() - project.dirtyDays * DAY,
        detached: project.detached,
        deployments: project.deployments.map((dep) => ({ kind: "deploy", ...dep })),
        iconUrl: null,
        size: { bytes: project.bytes, files: project.files, at: Date.now(), state: "ready", truncated: false },
      });
    }

    case "/size": {
      const project = byDirectory(query.directory);
      return json({
        bytes: project?.bytes ?? 0,
        files: project?.files ?? 0,
        at: Date.now(),
        state: "ready",
        truncated: false,
      });
    }

    case "/readme":
      return json({ text: "", hash: "demo" });

    case "/git": {
      const project = byDirectory(query.directory);
      if (!project) return { status: 404, headers: {}, body: "{}" };
      return json(gitHistory(project.id));
    }

    case "/activity":
      return json(activity(query.projectId, Number(query.days) || 30));

    default:
      return { status: 200, headers: {}, body: "{}" };
  }
}

/* ----------------------------------------------------------- activity */

/** Small deterministic PRNG, so the chart looks the same on every run. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function activity(projectId: string, days: number) {
  const rng = mulberry32(20261118 + projectId.length * 17);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const points = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * DAY);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const burst = Math.sin(offset / 5) * 0.5 + 0.9;
    let steps = Math.round(rng() * 900 * burst * (weekend ? 0.3 : 1));
    if (rng() < (weekend ? 0.45 : 0.1)) steps = 0;
    if (offset === 0) steps = Math.max(steps, 640);
    points.push({ date: isoDay(date), steps });
  }

  let streak = 0;
  for (let index = points.length - 1; index >= 0 && points[index].steps > 0; index -= 1) streak += 1;

  const steps = points.reduce((sum, point) => sum + point.steps, 0);
  return {
    available: true,
    days,
    sessions: Math.round(steps / 380),
    prompts: Math.round(steps / 42),
    steps,
    activeDays: points.filter((point) => point.steps > 0).length,
    streak,
    cost: 0,
    points,
    knowledge: knowledgeFor(projectId),
  };
}

/** Plans and todos per demo project, so each project page reads as its own project. */
function knowledgeFor(projectId: string) {
  const todo = (text: string, days: number) => ({ text, createdAt: Date.now() - days * DAY });
  const plan = (id: string, title: string, total: number, done: number) => ({
    id,
    file: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
    title,
    total,
    done,
    open: total - done,
  });

  if (projectId === "demo_paperkite") {
    return {
      available: true,
      openTodos: 5,
      doneTodos: 9,
      notes: 0,
      todos: [
        todo("Fix the staging deploy before the Tooltip docs go out", 1),
        todo("Add keyboard shortcuts to the component playground", 2),
        todo("Write the migration guide for the 2.0 token names", 4),
        todo("Check colour contrast on every dark-theme example", 7),
      ],
      plans: [
        plan("p1", "Component playground with live previews", 8, 5),
        plan("p2", "Design token migration guide", 5, 1),
        plan("p3", "Search across the docs", 4, 4),
      ],
    };
  }

  if (projectId === "demo_lumen") {
    return {
      available: true,
      openTodos: 7,
      doneTodos: 12,
      notes: 0,
      todos: [
        todo("Send order-ready SMS when a pickup slot is confirmed", 2),
        todo("Show allergen warnings on the cart page, not only the product page", 3),
        todo("Replace the placeholder hero photo with the new bakery shoot", 6),
        todo("Load-test checkout before the holiday menu goes live", 8),
        todo("Move image uploads to signed URLs", 9),
      ],
      plans: [
        plan("p1", "Online ordering and pickup slots", 9, 5),
        plan("p2", "Allergen labels on every product", 4, 3),
        plan("p3", "Admin order board for the kitchen", 6, 1),
        plan("p4", "Holiday menu landing page", 6, 6),
      ],
    };
  }

  return {
    available: true,
    openTodos: 3,
    doneTodos: 6,
    notes: 0,
    todos: [
      todo("Review the open pull requests", 2),
      todo("Update the README with the new setup steps", 5),
      todo("Plan the next release", 9),
    ],
    plans: [plan("p1", "Next release", 6, 3), plan("p2", "Cleanup and refactors", 5, 2)],
  };
}

/* -------------------------------------------------------- git history */

const GIT_SUBJECTS = [
  "fix: checkout total rounding for pickup orders",
  "feat: reminder scheduling queue",
  "docs: rewrite the deployment runbook",
  "refactor: split the order board by station",
  "fix: retry photo uploads on flaky networks",
  "chore: bump dependencies for the holiday freeze",
  "feat: allergen labels on every product card",
  "fix: tooltip overflow on narrow viewports",
];

const SUBJECTS: Record<string, string[]> = {
  demo_paperkite: [
    "docs: document the Tooltip component",
    "fix: tooltip overflow on narrow viewports",
    "feat: live preview for the Button variants",
    "chore: pin the Astro and MDX versions",
    "docs: add a dark-theme example to Card",
  ],
};

/** Seeded 182-day commit series with a realistic weekday rhythm. */
function gitHistory(projectId: string) {
  const project = PROJECTS.find((item) => item.id === projectId) ?? PROJECTS[0];
  const rng = mulberry32(987654 + projectId.length * 101);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const days = [];
  for (let offset = 181; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * DAY);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    let commits = Math.round(rng() * 6 * (weekend ? 0.25 : 1));
    if (rng() < (weekend ? 0.5 : 0.12)) commits = 0;
    if (offset === 0) commits = Math.max(commits, 2);
    days.push({ date: isoDay(date), commits });
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
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].commits > 0) {
      const at = new Date(`${days[index].date}T15:24:00`).getTime();
      lastCommit = {
        hash: Math.floor(rng() * 0xffffff).toString(16).padStart(6, "0").slice(0, 7),
        subject: (SUBJECTS[projectId] ?? GIT_SUBJECTS)[Math.floor(rng() * (SUBJECTS[projectId] ?? GIT_SUBJECTS).length)],
        at,
      };
      break;
    }
  }

  return {
    available: true,
    days,
    total: days.reduce((sum, day) => sum + day.commits, 0),
    bestStreak,
    currentStreak,
    lastCommit,
    ahead: project.ahead,
    behind: project.behind,
    upstream: project.ahead || project.behind ? "origin/main" : null,
    dirtySince: project.dirtyDays == null ? null : Date.now() - project.dirtyDays * DAY,
    detached: project.detached,
  };
}

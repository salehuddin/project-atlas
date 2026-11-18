import { connectHost, HostRequestError } from "@openchamber/sdk";
import { applyHostReady } from "@openchamber/sdk/ui";

/* --------------------------------------------------------------- types */

type Project = { id: string; name: string; directory: string };

type Session = {
  id: string;
  title: string;
  updatedAt: number;
  activity: string;
  outcome: string | null;
  archivedAt: number | null;
  unread?: boolean;
  parentId: string | null;
};

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

type Vitals = {
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
  iconUrl: string | null;
  size: SizeInfo;
  ahead: number | null;
  behind: number | null;
  dirtySince: number | null;
  detached: boolean;
};

type ProjectMeta = {
  pinned?: boolean;
  group?: string | null;
  hidden?: boolean;
};

type ProbeEntry = { at: number; live: boolean | null; ms: number | null };

type GitDay = { date: string; commits: number };

type GitCommit = { hash: string; subject: string; at: number };

type GitData = {
  available: boolean;
  days: GitDay[];
  total: number;
  bestStreak: number;
  currentStreak: number;
  lastCommit: GitCommit | null;
  ahead: number | null;
  behind: number | null;
  upstream: string | null;
  dirtySince: number | null;
  detached: boolean;
};

type Card = {
  project: Project;
  sessions: Session[];
  last: Session | null;
  chats: number;
  worktrees: number;
  vitals: Vitals | null;
  vitalsError: string | null;
  summary: string | null;
  summaryState: "idle" | "queued" | "loading" | "error";
  manualSite: string | null;
  editingSite: boolean;
  siteDraft: string;
  meta: ProjectMeta;
  editingGroup: boolean;
  groupDraft: string;
  icon: string | null;
  iconColor: string | null;
};

type ActivityPoint = { date: string; steps: number };

type PlanInfo = {
  id: string;
  title: string;
  file: string;
  total: number;
  done: number;
  open: number;
};

type Knowledge = {
  available: boolean;
  openTodos: number;
  doneTodos: number;
  todos: Array<{ text: string; createdAt: number | null }>;
  plans: PlanInfo[];
  notes: number;
};

type ActivityData = {
  available: boolean;
  days: number;
  sessions: number;
  prompts: number;
  steps: number;
  activeDays: number;
  streak: number;
  cost: number;
  points: ActivityPoint[];
  knowledge: Knowledge;
};

/* --------------------------------------------------------------- state */

const SUMMARY_PREFIX = "atlas:v1:summary:";
const SITE_PREFIX = "atlas:v1:site:";
const META_PREFIX = "atlas:v1:meta:";
const PROBE_PREFIX = "atlas:v1:probes:";
const SETTINGS_KEY = "atlas:v1:settings";

type Settings = { ai: boolean; groupOn: boolean; collapsed: Record<string, boolean>; showHidden: boolean };

const SYSTEM_PROMPT =
  "You write project blurbs. Two sentences, at most 45 words. Say what the project is, " +
  "its main stack, and how it ships. Plain text only: no markdown, no quotes, no preamble.";

const host = connectHost();

const state = {
  cards: [] as Card[],
  query: "",
  sort: "attention",
  ai: true,
  groupOn: true,
  collapsed: {} as Record<string, boolean>,
  showHidden: false,
  directory: null as string | null,
  surface: "panel",
  serviceDown: false,
  sizeTimer: 0 as unknown as ReturnType<typeof setInterval> | 0,
  sizePolls: 0,
  view: "board" as "board" | "project",
  viewId: null as string | null,
  range: 30,
  activity: null as ActivityData | null,
  activityState: "idle" as "idle" | "loading" | "ready" | "error",
  activityFor: null as string | null,
  git: null as GitData | null,
  gitState: "idle" as "idle" | "loading" | "ready" | "error",
  gitFor: null as string | null,
  probes: new Map<string, Record<string, ProbeEntry[]>>(),
};

const summaryCache = new Map<string, { text: string; hash: string }>();
const siteCache = new Map<string, string>();
const metaCache = new Map<string, ProjectMeta>();
const iconIndex = new Map<string, { icon: string | null; color: string | null }>();

const summaryQueue: Card[] = [];
let summaryRunning = false;

/* ----------------------------------------------------------------- dom */

const countEl = document.querySelector<HTMLElement>("#count")!;
const searchEl = document.querySelector<HTMLInputElement>("#search")!;
const sortEl = document.querySelector<HTMLSelectElement>("#sort")!;
const aiEl = document.querySelector<HTMLInputElement>("#ai")!;
const refreshEl = document.querySelector<HTMLButtonElement>("#refresh")!;
const groupEl = document.querySelector<HTMLButtonElement>("#group")!;
const hiddenEl = document.querySelector<HTMLButtonElement>("#hidden-toggle")!;
const noticeEl = document.querySelector<HTMLElement>("#notice")!;
const gridEl = document.querySelector<HTMLElement>("#grid")!;
const footerEl = document.querySelector<HTMLElement>("#footer")!;

function div(cls: string): HTMLDivElement {
  const node = document.createElement("div");
  node.className = cls;
  return node;
}

function span(cls: string, text: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.className = cls;
  node.textContent = text;
  return node;
}

function chip(text: string, cls = ""): HTMLSpanElement {
  return span(`chip ${cls}`.trim(), text);
}

/* -------------------------------------------------------------- render */

function render(): void {
  const visible = state.cards.filter((card) => !card.meta.hidden);
  countEl.textContent = String(visible.length);

  const hiddenCount = state.cards.length - visible.length;
  hiddenEl.hidden = hiddenCount === 0 && !state.showHidden;
  hiddenEl.textContent = state.showHidden ? `Hide hidden (${hiddenCount})` : `Hidden (${hiddenCount})`;
  hiddenEl.setAttribute("aria-pressed", String(state.showHidden));
  groupEl.textContent = `Group: ${state.groupOn ? "On" : "Off"}`;
  groupEl.setAttribute("aria-pressed", String(state.groupOn));

  if (state.view === "project") {
    const card = state.cards.find((item) => item.project.id === state.viewId);
    gridEl.dataset.mode = "detail";
    gridEl.replaceChildren(card ? renderDetail(card) : mutedLine("That project is no longer open."));
  } else {
    gridEl.dataset.mode = "board";
    gridEl.replaceChildren(...renderBoard());
    if (state.cards.length === 0) {
      const empty = div("empty");
      const title = document.createElement("b");
      title.textContent = "No projects yet";
      empty.append(title, document.createTextNode("Open a folder in OpenChamber and it appears here."));
      gridEl.append(empty);
    }
  }

  footerEl.textContent = footerText();
}

/** Board rows: one flat pinned-first list, or Pinned / group / Ungrouped sections. */
function renderBoard(): HTMLElement[] {
  const list = visibleCards();
  if (!state.groupOn) {
    const pinned = list.filter((card) => card.meta.pinned);
    const rest = list.filter((card) => !card.meta.pinned);
    return [...pinned, ...rest].map(renderCard);
  }

  const nodes: HTMLElement[] = [];
  const pinned = list.filter((card) => card.meta.pinned);
  const rest = list.filter((card) => !card.meta.pinned);
  if (pinned.length) nodes.push(renderSection("Pinned", pinned));
  const groups = new Map<string, Card[]>();
  const ungrouped: Card[] = [];
  for (const card of rest) {
    const group = card.meta.group?.trim();
    if (group) {
      const bucket = groups.get(group);
      if (bucket) bucket.push(card);
      else groups.set(group, [card]);
    } else {
      ungrouped.push(card);
    }
  }
  for (const name of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    const bucket = groups.get(name);
    if (bucket) nodes.push(renderSection(name, bucket));
  }
  if (ungrouped.length) nodes.push(renderSection("Ungrouped", ungrouped));
  if (!nodes.length && list.length) nodes.push(...list.map(renderCard));
  return nodes;
}

function renderSection(title: string, cards: Card[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "section";
  const key = `section:${title}`;
  const collapsed = Boolean(state.collapsed[key]);

  const head = document.createElement("button");
  head.className = "section-head";
  head.dataset.act = "collapse";
  head.dataset.section = key;
  head.setAttribute("aria-expanded", String(!collapsed));
  head.title = collapsed ? `Expand ${title}` : `Collapse ${title}`;
  const caret = span("", collapsed ? "▸" : "▾");
  const label = document.createElement("b");
  label.textContent = title;
  head.append(caret, label, span("count", String(cards.length)));
  section.append(head);

  if (!collapsed) {
    const body = div("section-body");
    // Pinned first inside the section, then the board sort.
    const pinned = cards.filter((card) => card.meta.pinned);
    const rest = cards.filter((card) => !card.meta.pinned);
    for (const card of [...pinned, ...rest]) body.append(renderCard(card));
    section.append(body);
  }
  return section;
}

let rafId = 0;
function scheduleRender(): void {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && gridEl.contains(active)) return;
    render();
  });
}

function visibleCards(): Card[] {
  const query = state.query.trim().toLowerCase();
  const list = state.cards.filter((card) => {
    if (card.meta.hidden && !state.showHidden) return false;
    if (!query) return true;
    const haystack = [card.project.name, card.project.directory, card.meta.group ?? "", ...(card.vitals?.stack ?? [])]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  switch (state.sort) {
    case "recent":
      list.sort((a, b) => (b.last?.updatedAt ?? 0) - (a.last?.updatedAt ?? 0));
      break;
    case "name":
      list.sort((a, b) => a.project.name.localeCompare(b.project.name));
      break;
    case "size":
      list.sort((a, b) => (b.vitals?.size.bytes ?? -1) - (a.vitals?.size.bytes ?? -1));
      break;
    default:
      list.sort((a, b) => score(b) - score(a) || a.project.name.localeCompare(b.project.name));
  }
  return list;
}

function score(card: Card): number {
  const last = card.last;
  let value = 0;
  for (const dep of card.vitals?.deployments ?? []) {
    if (dep.live === false) value += 500;
    if (dep.cert && (!dep.cert.authorized || (dep.cert.daysLeft != null && dep.cert.daysLeft <= 7))) value += 400;
  }
  if (!last) return value;
  if (last.activity === "waiting-permission") value += 1000;
  else if (last.activity === "waiting-question") value += 950;
  else if (last.activity === "running" || last.activity === "retrying") value += 900;
  if (last.unread) value += 800;
  if (last.outcome === "failed") value += 600;
  value += Math.max(0, 300 - (Date.now() - last.updatedAt) / 3_600_000);
  return value;
}

function renderCard(card: Card): HTMLElement {
  const el = document.createElement("article");
  el.className = `card${card.meta.hidden ? " dim" : ""}`;
  el.dataset.id = card.project.id;
  if (card.project.directory === state.directory) el.dataset.current = "true";

  /* headline */
  const top = div("card-top");
  const dot = div("dot state-dot");
  dot.dataset.state = activityState(card.last);
  dot.title = activityTitle(card.last);

  const avatar = renderAvatar(card);
  avatar.append(dot);

  const names = div("names");
  const name = document.createElement("button");
  name.className = "name";
  name.dataset.act = "detail";
  name.textContent = card.project.name;
  name.title = `Open ${card.project.name}`;
  const path = span("path", card.vitals?.shortPath ?? card.project.directory);
  names.append(name, path);

  const pin = document.createElement("button");
  pin.className = "pin";
  pin.dataset.act = "pin";
  pin.dataset.on = String(Boolean(card.meta.pinned));
  pin.setAttribute("aria-pressed", String(Boolean(card.meta.pinned)));
  pin.setAttribute("aria-label", card.meta.pinned ? `Unpin ${card.project.name}` : `Pin ${card.project.name}`);
  pin.title = pin.getAttribute("aria-label") ?? "";
  pin.textContent = card.meta.pinned ? "★" : "☆";
  top.append(avatar, names, pin, span("ago", ago(card.last?.updatedAt)));

  /* summary */
  const summary = document.createElement("p");
  if (card.summary) {
    summary.className = "summary";
    summary.textContent = card.summary;
  } else if (card.summaryState === "loading" || card.summaryState === "queued") {
    summary.className = "summary skeleton";
    summary.textContent = "Summary loading";
  } else if (state.ai) {
    summary.className = "summary placeholder";
    summary.textContent = card.summaryState === "error" ? "Could not write a blurb." : "No blurb yet.";
  }

  /* stack */
  const stack = div("stack");
  for (const item of card.vitals?.stack ?? []) stack.append(span("", item));

  el.append(top, buildMeta(card));
  if (summary.className) el.append(summary);
  if (stack.childElementCount) el.append(stack);
  if (card.editingGroup) el.append(renderGroupEditor(card));
  else {
    if (card.editingSite) el.append(renderSiteEditor(card));
    el.append(buildActions(card));
  }
  return el;
}

function buildMeta(card: Card): HTMLElement {
  const meta = div("meta");
  if (card.vitals) {
    if (card.vitals.branch) meta.append(chip(card.vitals.branch));
    if (card.vitals.dirty) meta.append(chip(`±${card.vitals.dirty}`, "warn"));
    if (card.vitals.ahead) {
      const up = chip(`↑${card.vitals.ahead}`, "warn");
      up.title = `${card.vitals.ahead} unpushed commit${card.vitals.ahead === 1 ? "" : "s"}`;
      meta.append(up);
    }
    if (card.vitals.behind) {
      const down = chip(`↓${card.vitals.behind}`);
      down.title = `${card.vitals.behind} commit${card.vitals.behind === 1 ? "" : "s"} behind the upstream`;
      meta.append(down);
    }
    if (card.vitals.dirty && card.vitals.dirtySince) {
      const ageDays = Math.floor((Date.now() - card.vitals.dirtySince) / 86_400_000);
      if (ageDays >= 3) {
        const stale = chip(`dirty ${ageDays}d`, "warn");
        stale.title = `Uncommitted changes since ${new Date(card.vitals.dirtySince).toLocaleDateString()}`;
        meta.append(stale);
      }
    }
    if (card.vitals.kind === "folder") meta.append(chip("folder"));
    meta.append(chip(sizeLabel(card)));
    if (card.vitals.size.state === "ready" && card.vitals.size.files) {
      meta.append(chip(`${card.vitals.size.files.toLocaleString()} files`));
    }
  } else if (card.vitalsError) {
    meta.append(chip(card.vitalsError, "fail"));
  }
  if (card.chats) meta.append(chip(`${card.chats} chat${card.chats === 1 ? "" : "s"}`));
  if (card.worktrees) meta.append(chip(`${card.worktrees} tree${card.worktrees === 1 ? "" : "s"}`));
  if (card.last?.outcome === "failed") meta.append(chip("last turn failed", "fail"));

  if (!card.editingGroup) {
    const group = chip(card.meta.group?.trim() ? card.meta.group.trim() : "+ group", "edit");
    group.dataset.act = "edit-group";
    group.title = card.meta.group ? `Group: ${card.meta.group}. Click to change it.` : "Put this project in a group.";
    meta.append(group);
  }

  const deployments = card.vitals?.deployments ?? [];
  for (const dep of deployments.slice(0, 3)) meta.append(deploymentChip(dep));
  if (!card.editingSite) {
    const edit = chip(deployments.length ? "edit site" : "+ site", "edit");
    edit.dataset.act = "edit-site";
    meta.append(edit);
  }
  return meta;
}

function buildActions(card: Card): HTMLElement {
  const actions = div("actions");
  actions.append(actionButton(card.last ? "Resume" : "Start chat", "open", "primary"));
  if (card.last) actions.append(actionButton("New chat", "new"));
  actions.append(actionButton("Folder", "folder"));
  if (card.project.directory === state.directory) {
    actions.append(actionButton("Files", "files"), actionButton("Git", "git"));
  }
  if (card.vitals?.web) actions.append(actionButton("GitHub", "github"));
  actions.append(actionButton("Copy path", "copy"));
  if (card.summary) actions.append(actionButton("Rewrite", "rewrite"));
  actions.append(actionButton(card.meta.hidden ? "Unhide" : "Hide", card.meta.hidden ? "unhide" : "hide"));
  return actions;
}

/* ------------------------------------------------------------- detail */

function renderDetail(card: Card): HTMLElement {
  const wrap = div("detail");

  const head = div("detail-head");
  head.append(actionButton("← All projects", "back"));

  const identity = div("detail-identity");
  const dot = div("dot state-dot");
  dot.dataset.state = activityState(card.last);
  dot.title = activityTitle(card.last);
  const avatar = renderAvatar(card, "lg");
  avatar.append(dot);
  const titles = div("detail-title");
  const heading = document.createElement("h2");
  heading.textContent = card.project.name;
  titles.append(heading, span("path", card.vitals?.shortPath ?? card.project.directory));
  identity.append(avatar, titles);
  head.append(identity);
  wrap.append(head);

  wrap.append(buildMeta(card));

  if (card.summary) {
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    summary.textContent = card.summary;
    wrap.append(summary);
  }

  wrap.append(buildActions(card));
  if (card.editingGroup) wrap.append(renderGroupEditor(card));
  if (card.editingSite) wrap.append(renderSiteEditor(card));
  wrap.append(renderActivityPanel(card));
  wrap.append(renderGitPanel(card));
  wrap.append(renderDeploymentsPanel(card));
  wrap.append(renderKnowledgePanel(card));
  return wrap;
}

function renderActivityPanel(card: Card): HTMLElement {
  const section = div("panel");

  const head = div("panel-head");
  const title = document.createElement("h3");
  title.textContent = "Activity";
  const seg = div("seg");
  for (const days of [7, 30, 90]) {
    const button = document.createElement("button");
    button.className = "seg-btn";
    button.dataset.act = `range-${days}`;
    button.textContent = `${days}d`;
    button.setAttribute("aria-pressed", String(state.range === days));
    seg.append(button);
  }
  head.append(title, seg);
  section.append(head);

  if (state.activityState === "loading" || state.activityState === "idle") {
    section.append(mutedLine("Reading activity…"));
    return section;
  }
  if (state.activityState === "error") {
    section.append(mutedLine("Could not read activity for this project."));
    return section;
  }

  const data = state.activity;
  if (!data) return section;

  if (!data.available) {
    section.append(
      mutedLine("The opencode CLI was not found, so there is no daily series. Plans and todos still load."),
    );
  } else {
    const stats = div("stats");
    const cells: Array<[string, string]> = [
      [data.steps.toLocaleString(), "steps"],
      [data.prompts.toLocaleString(), "prompts"],
      [data.sessions.toLocaleString(), "sessions"],
      [data.activeDays.toLocaleString(), "active days"],
      [data.streak.toLocaleString(), "day streak"],
      [data.cost ? `$${data.cost.toFixed(2)}` : "—", "cost"],
    ];
    for (const [value, label] of cells) {
      const cell = div("stat");
      const strong = document.createElement("b");
      strong.textContent = value;
      cell.append(strong, span("", label));
      stats.append(cell);
    }
    section.append(stats);
    section.append(renderChart(data.points));
  }

  return section;
}

function renderChart(points: ActivityPoint[]): HTMLElement {
  const wrap = div("chart-wrap");
  const chart = div("chart");
  const max = Math.max(1, ...points.map((point) => point.steps));

  for (const point of points) {
    const column = div("chart-col");
    column.title = `${point.date} · ${point.steps.toLocaleString()} steps`;
    const bar = div("chart-bar");
    bar.style.height = `${Math.max(2, Math.round((point.steps / max) * 100))}%`;
    if (!point.steps) bar.dataset.zero = "true";
    column.append(bar);
    chart.append(column);
  }

  const legend = div("chart-legend");
  legend.append(span("", points[0]?.date ?? ""), span("", points[points.length - 1]?.date ?? ""));
  wrap.append(chart, legend);
  return wrap;
}

function renderGitPanel(card: Card): HTMLElement {
  const section = div("panel");

  const head = div("panel-head");
  const title = document.createElement("h3");
  title.textContent = "Commits";
  head.append(title);
  section.append(head);

  if (state.gitFor !== card.project.id || state.gitState === "loading" || state.gitState === "idle") {
    section.append(mutedLine("Reading commit history…"));
    return section;
  }
  if (state.gitState === "error" || !state.git) {
    section.append(mutedLine("Could not read commit history for this project."));
    return section;
  }

  const data = state.git;
  if (!data.available) {
    section.append(mutedLine("Not a git repository, so there is no commit history."));
    return section;
  }

  section.append(renderHeatmap(data.days));

  const stats = div("stats");
  const cells: Array<[string, string]> = [
    [data.total.toLocaleString(), "commits in 26 weeks"],
    [data.currentStreak.toLocaleString(), "current streak (days)"],
    [data.bestStreak.toLocaleString(), "best streak (days)"],
  ];
  for (const [value, label] of cells) {
    const cell = div("stat");
    const strong = document.createElement("b");
    strong.textContent = value;
    cell.append(strong, span("", label));
    stats.append(cell);
  }
  section.append(stats);

  if (data.lastCommit) {
    const recent = ago(data.lastCommit.at);
    section.append(
      mutedLine(
        `Last commit ${data.lastCommit.hash} — ${data.lastCommit.subject || "(no message)"} · ${recent && recent !== "now" ? `${recent} ago` : "just now"}`,
      ),
    );
  }
  if (data.upstream) {
    const sync: string[] = [];
    if (data.ahead) sync.push(`↑${data.ahead} unpushed`);
    if (data.behind) sync.push(`↓${data.behind} behind`);
    if (sync.length) section.append(mutedLine(`${data.upstream}: ${sync.join(", ")}`));
  }
  return section;
}

/** GitHub-style heatmap: 7 rows (Mon..Sun), one column per week, 5 levels. */
function renderHeatmap(days: GitDay[]): HTMLElement {
  const wrap = div("heat-wrap");
  const max = Math.max(0, ...days.map((day) => day.commits));
  const levelOf = (commits: number): number => {
    if (!commits || max <= 0) return 0;
    return 1 + Math.min(3, Math.floor((commits / max) * 4));
  };

  // Pad so the first column starts on a Monday; trailing days form the last column.
  const first = days.length ? new Date(`${days[0].date}T12:00:00`) : new Date();
  const pad = (first.getDay() + 6) % 7;
  const cells: (GitDay | null)[] = [...Array<null>(pad).fill(null), ...days];
  const weeks = Math.max(1, Math.ceil(cells.length / 7));

  const months = div("heat-months");
  months.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;
  let lastMonth = "";
  for (let week = 0; week < weeks; week += 1) {
    const cell = cells[week * 7];
    const label = span("", "");
    if (cell) {
      const month = new Date(`${cell.date}T12:00:00`).toLocaleString(undefined, { month: "short" });
      if (month !== lastMonth) {
        label.textContent = month;
        lastMonth = month;
      }
    }
    months.append(label);
  }

  const grid = div("heat");
  grid.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;
  for (let week = 0; week < weeks; week += 1) {
    for (let row = 0; row < 7; row += 1) {
      const cell = cells[week * 7 + row];
      const node = div("heat-cell");
      if (!cell) {
        node.dataset.level = "empty";
      } else {
        node.dataset.level = String(levelOf(cell.commits));
        node.title = `${cell.date}, ${cell.commits} commit${cell.commits === 1 ? "" : "s"}`;
      }
      // Monday-first rows, top to bottom.
      node.style.gridRow = String(row + 1);
      node.style.gridColumn = String(week + 1);
      grid.append(node);
    }
  }
  wrap.append(months, grid);
  return wrap;
}

function renderDeploymentsPanel(card: Card): HTMLElement {
  const section = div("panel");

  const head = div("panel-head");
  const title = document.createElement("h3");
  title.textContent = "Deployments";
  const check = actionButton("Check now", "check-now");
  head.append(title, check);
  section.append(head);

  section.append(
    mutedLine("Checks observed while Atlas is open — not continuous monitoring."),
  );

  const deployments = card.vitals?.deployments ?? [];
  if (!deployments.length) {
    section.append(mutedLine("No deployments detected. Add one with + site on the card."));
    return section;
  }

  const history = state.probes.get(card.project.id) ?? {};
  for (const dep of deployments) {
    const row = div("dep-row");
    const dot = document.createElement("i");
    dot.className = "mini-dot";
    dot.dataset.live = dep.live === true ? "up" : dep.live === false ? "down" : "unknown";

    const link = document.createElement("button");
    link.className = "dep-host";
    link.dataset.act = "deploy";
    link.dataset.url = dep.url;
    link.textContent = hostOf(dep.url) ?? dep.label;
    link.title = `${dep.label} · ${dep.source} — open it`;
    row.append(dot, link);

    const facts: string[] = [];
    facts.push(dep.status ? `HTTP ${dep.status}` : dep.live === false ? "unreachable" : "not checked");
    if (dep.ms != null) facts.push(`${dep.ms} ms`);
    if (dep.cert?.validTo != null) {
      const days = dep.cert.daysLeft;
      facts.push(days != null && days < 0 ? `cert expired ${new Date(dep.cert.validTo).toLocaleDateString()}` : `cert expires ${new Date(dep.cert.validTo).toLocaleDateString()} (${days}d)`);
    }
    row.append(span("dep-facts", facts.join(" · ")));

    const entries = history[dep.url] ?? [];
    const downSince = downSinceMs(entries);
    if (dep.live === false && downSince != null) {
      const recent = ago(downSince);
      const down = span("dep-down", `down since ${recent && recent !== "now" ? `${recent} ago` : "just now"}`);
      row.append(down);
    }

    if (entries.length) {
      const dots = div("probe-dots");
      for (const entry of entries.slice(-20)) {
        const mark = document.createElement("i");
        mark.className = "probe-dot";
        mark.dataset.live = entry.live === true ? "up" : entry.live === false ? "down" : "unknown";
        mark.title = `${new Date(entry.at).toLocaleString()} · ${entry.live === true ? "up" : entry.live === false ? "down" : "unknown"}${entry.ms != null ? ` · ${entry.ms} ms` : ""}`;
        dots.append(mark);
      }
      row.append(dots);
    }
    section.append(row);
  }
  return section;
}

/** Timestamp of the first entry in the current trailing run of failed checks. */
function downSinceMs(entries: ProbeEntry[]): number | null {
  let first: number | null = null;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].live !== false) break;
    first = entries[index].at;
  }
  return first;
}

function renderKnowledgePanel(card: Card): HTMLElement {
  const section = div("panel");
  const head = div("panel-head");
  const title = document.createElement("h3");
  title.textContent = "Plans & todos";

  const knowledge = state.activity?.knowledge ?? null;
  if (!knowledge?.available) {
    head.append(title);
    section.append(head, mutedLine("No notes, todos or plans for this project."));
    return section;
  }

  head.append(title, chip(`${knowledge.openTodos} open todo${knowledge.openTodos === 1 ? "" : "s"}`, knowledge.openTodos ? "warn" : ""));
  section.append(head);

  const openPlans = knowledge.plans.filter((plan) => plan.open > 0);
  const openSteps = knowledge.plans.reduce((sum, plan) => sum + plan.open, 0);
  section.append(
    mutedLine(
      `${knowledge.plans.length} plan${knowledge.plans.length === 1 ? "" : "s"} · ${openSteps} open step${
        openSteps === 1 ? "" : "s"
      }${knowledge.notes ? ` · ${knowledge.notes} note${knowledge.notes === 1 ? "" : "s"}` : ""}`,
    ),
  );

  if (knowledge.plans.length) {
    const list = div("plans");
    for (const plan of knowledge.plans.slice(0, 8)) {
      const row = div("plan");
      const top = div("plan-top");
      const name = span("plan-title", plan.title);
      name.title = plan.file;
      top.append(name, chip(`${plan.open} open`, plan.open ? "warn" : ""));
      const bar = div("progress");
      const fill = document.createElement("i");
      fill.style.width = plan.total ? `${Math.round((plan.done / plan.total) * 100)}%` : "0%";
      bar.append(fill);
      row.append(top, bar, mutedLine(`${plan.done}/${plan.total} steps`));
      list.append(row);
    }
    section.append(list);
  } else if (!openPlans.length) {
    section.append(mutedLine("No plans yet."));
  }

  if (knowledge.todos.length) {
    const list = document.createElement("ul");
    list.className = "todos";
    for (const todo of knowledge.todos) {
      const item = document.createElement("li");
      item.textContent = todo.text;
      list.append(item);
    }
    section.append(list);
    if (knowledge.openTodos > knowledge.todos.length) {
      section.append(mutedLine(`+ ${knowledge.openTodos - knowledge.todos.length} more open`));
    }
  }

  return section;
}

function mutedLine(text: string): HTMLElement {
  const node = div("muted");
  node.textContent = text;
  return node;
}

async function loadActivity(card: Card, days = state.range): Promise<void> {
  state.activityFor = card.project.id;
  state.activityState = "loading";
  state.activity = null;
  render();

  try {
    const response = await host.serviceRequest({
      method: "GET",
      path: "/activity",
      query: { directory: card.project.directory, projectId: card.project.id, days: String(days) },
    });
    if (response.status !== 200) throw new Error(`service answered ${response.status}`);
    if (state.activityFor !== card.project.id) return;
    state.activity = JSON.parse(response.body) as ActivityData;
    state.activityState = "ready";
  } catch {
    if (state.activityFor !== card.project.id) return;
    state.activityState = "error";
  }
  render();
}

/** Commit heatmap, loaded lazily like /size so a slow git log never blocks the page. */
async function loadGit(card: Card): Promise<void> {
  state.gitFor = card.project.id;
  state.gitState = "loading";
  state.git = null;
  render();

  try {
    const response = await host.serviceRequest({
      method: "GET",
      path: "/git",
      query: { directory: card.project.directory },
    });
    if (response.status !== 200) throw new Error(`service answered ${response.status}`);
    if (state.gitFor !== card.project.id) return;
    state.git = JSON.parse(response.body) as GitData;
    state.gitState = "ready";
  } catch {
    if (state.gitFor !== card.project.id) return;
    state.gitState = "error";
  }
  render();
}

/**
 * Per-project probe history: after each vitals load, append `{ at, live, ms }`
 * per deployment URL, capped at 40 entries. Skips the append when the last
 * entry is under 5 minutes old, so refreshes do not flood the dots.
 */
async function recordProbes(card: Card): Promise<void> {
  const deployments = card.vitals?.deployments ?? [];
  if (!deployments.length) return;
  let history = state.probes.get(card.project.id);
  if (!history) {
    history = {};
    state.probes.set(card.project.id, history);
  }
  let dirty = false;
  const now = Date.now();
  for (const dep of deployments) {
    const entries = history[dep.url] ?? [];
    const last = entries[entries.length - 1];
    if (last && now - last.at < 5 * 60_000) continue;
    entries.push({ at: now, live: dep.live, ms: dep.ms ?? null });
    history[dep.url] = entries.slice(-40);
    dirty = true;
  }
  if (dirty) {
    await host.storage.set(`${PROBE_PREFIX}${card.project.id}`, history).catch(() => {});
  }
}

function renderSiteEditor(card: Card): HTMLElement {
  const row = div("editor");
  const input = document.createElement("input");
  input.type = "url";
  input.placeholder = "https://example.com";
  input.value = card.siteDraft || card.manualSite || "";
  input.dataset.siteInput = card.project.id;
  input.setAttribute("aria-label", `Live site for ${card.project.name}`);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveSite(card);
    }
    if (event.key === "Escape") {
      card.editingSite = false;
      render();
    }
  });
  const save = actionButton("Save", "save-site", "primary");
  const cancel = actionButton("Cancel", "cancel-site");
  row.append(input, save, cancel);
  requestAnimationFrame(() => input.focus());
  return row;
}

function renderGroupEditor(card: Card): HTMLElement {
  const row = div("editor");
  const input = document.createElement("input");
  input.placeholder = "Group name (empty clears)…";
  input.value = card.groupDraft;
  input.dataset.groupInput = card.project.id;
  input.setAttribute("aria-label", `Group for ${card.project.name}`);
  input.setAttribute("list", "atlas-groups");
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveGroup(card);
    }
    if (event.key === "Escape") {
      card.editingGroup = false;
      render();
    }
  });
  const data = document.createElement("datalist");
  data.id = "atlas-groups";
  for (const group of existingGroups()) {
    const option = document.createElement("option");
    option.value = group;
    data.append(option);
  }
  const save = actionButton("Save", "save-group", "primary");
  const cancel = actionButton("Cancel", "cancel-group");
  row.append(input, data, save, cancel);
  requestAnimationFrame(() => input.focus());
  return row;
}

function existingGroups(): string[] {
  const names = new Set<string>();
  for (const card of state.cards) {
    const group = card.meta.group?.trim();
    if (group) names.add(group);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function actionButton(label: string, act: string, cls = ""): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `act ${cls}`.trim();
  button.dataset.act = act;
  button.textContent = label;
  return button;
}

function renderAvatar(card: Card, extra = ""): HTMLElement {
  const box = div(`avatar ${extra}`.trim());
  box.style.background = card.iconColor || hueColor(card.project.id || card.project.name);

  const letter = document.createElement("span");
  letter.className = "avatar-letter";
  letter.textContent = (card.project.name || "?").trim().charAt(0).toUpperCase();
  box.append(letter);

  const url = card.icon ?? card.vitals?.iconUrl ?? null;
  if (url) {
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.addEventListener("load", () => {
      letter.style.display = "none";
    });
    img.addEventListener("error", () => img.remove());
    img.src = url;
    box.append(img);
  }
  return box;
}

function hueColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return `hsl(${hash % 360} 45% 38%)`;
}

function deploymentChip(dep: Deployment): HTMLElement {
  const button = document.createElement("button");
  button.className = "chip link dep";
  button.dataset.act = "deploy";
  button.dataset.url = dep.url;

  const dot = document.createElement("i");
  dot.className = "mini-dot";
  dot.dataset.live = dep.live === true ? "up" : dep.live === false ? "down" : "unknown";

  button.append(dot, document.createTextNode(hostOf(dep.url) ?? dep.label));
  button.append(certBadge(dep.cert));
  const detail = dep.status
    ? `HTTP ${dep.status}`
    : dep.live === false
      ? "unreachable"
      : "not checked yet";
  button.title = `${dep.label} · ${dep.source} · ${detail}${dep.ms != null ? ` · ${dep.ms} ms` : ""}${certTitle(dep.cert)}`;
  return button;
}

/** Small `cert 9d` / `cert expired` badge; empty span when there is no cert. */
function certBadge(cert: CertInfo | null): HTMLElement {
  const badge = document.createElement("span");
  if (!cert || cert.daysLeft == null) return badge;
  if (cert.daysLeft < 0) {
    badge.className = "cert fail";
    badge.textContent = "cert expired";
  } else if (!cert.authorized || cert.daysLeft <= 7) {
    badge.className = "cert fail";
    badge.textContent = `cert ${cert.daysLeft}d`;
  } else if (cert.daysLeft <= 21) {
    badge.className = "cert warn";
    badge.textContent = `cert ${cert.daysLeft}d`;
  }
  return badge;
}

function certTitle(cert: CertInfo | null): string {
  if (!cert || cert.validTo == null) return "";
  const expiry = new Date(cert.validTo).toLocaleDateString();
  const issuer = cert.issuer ? `, issued to ${cert.issuer}` : "";
  const state = cert.daysLeft != null && cert.daysLeft < 0 ? "expired" : cert.authorized ? "valid" : `invalid (${cert.error ?? "not trusted"})`;
  return ` · cert ${state}, expires ${expiry}${issuer}`;
}

function footerText(): string {
  const hidden = state.cards.filter((card) => card.meta.hidden);
  const visibleCount = state.cards.length - hidden.length;
  const parts = [`${visibleCount} project${visibleCount === 1 ? "" : "s"}`];
  if (hidden.length && !state.showHidden) parts.push(`${hidden.length} hidden`);
  if (state.serviceDown) parts.push("local service offline");
  const measuring = state.cards.filter((card) => card.vitals?.size.state === "running").length;
  if (measuring) parts.push(`measuring ${measuring}`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------ the data */

async function boot(): Promise<void> {
  try {
    const settings = (await host.storage.get(SETTINGS_KEY).catch(() => null)) as Partial<Settings> | null;
    if (settings) {
      if (typeof settings.ai === "boolean") state.ai = settings.ai;
      if (typeof settings.groupOn === "boolean") state.groupOn = settings.groupOn;
      if (typeof settings.showHidden === "boolean") state.showHidden = settings.showHidden;
      if (settings.collapsed && typeof settings.collapsed === "object") state.collapsed = settings.collapsed;
    }
    aiEl.checked = state.ai;

    const keys = await host.storage.keys().catch(() => [] as string[]);
    await Promise.all(
      keys.map(async (key) => {
        if (key.startsWith(SUMMARY_PREFIX)) {
          const value = await host.storage.get(key).catch(() => null);
          if (value && typeof value.text === "string" && typeof value.hash === "string") {
            summaryCache.set(key.slice(SUMMARY_PREFIX.length), value);
          }
        } else if (key.startsWith(SITE_PREFIX)) {
          const value = await host.storage.get(key).catch(() => null);
          if (value && typeof value.site === "string") siteCache.set(key.slice(SITE_PREFIX.length), value.site);
        } else if (key.startsWith(META_PREFIX)) {
          const value = (await host.storage.get(key).catch(() => null)) as Partial<ProjectMeta> | null;
          if (value && typeof value === "object") {
            metaCache.set(key.slice(META_PREFIX.length), {
              pinned: value.pinned === true,
              group: typeof value.group === "string" && value.group.trim() ? value.group.trim() : null,
              hidden: value.hidden === true,
            });
          }
        } else if (key.startsWith(PROBE_PREFIX)) {
          const value = await host.storage.get(key).catch(() => null);
          if (value && typeof value === "object") {
            const id = key.slice(PROBE_PREFIX.length);
            state.probes.set(id, value as Record<string, ProbeEntry[]>);
          }
        }
      }),
    );

    await loadProjectIcons();

    const snapshot = await host.listProjects();
    state.cards = (snapshot.projects ?? []).map((project) => {
      const known = iconIndex.get(project.id) ?? iconIndex.get(normDir(project.directory));
      const meta = metaCache.get(project.id);
      return {
        project,
        sessions: [],
        last: null,
        chats: 0,
        worktrees: 0,
        vitals: null,
        vitalsError: null,
        summary: summaryCache.get(project.id)?.text ?? null,
        summaryState: "idle",
        manualSite: siteCache.get(project.id) ?? null,
        editingSite: false,
        siteDraft: "",
        meta: meta ? { ...meta } : {},
        editingGroup: false,
        groupDraft: "",
        icon: known?.icon ?? null,
        iconColor: known?.color ?? null,
      };
    });

    render();
    await Promise.all(state.cards.map((card) => loadProject(card)));
    scheduleRender();
  } catch (error) {
    const code = errorCode(error);
    if (code === "NOT_GRANTED") {
      showNotice("Project Atlas needs the “sessions” permission. Re-approve it in Settings → Extensions.", true);
    } else {
      showNotice(`Could not read projects: ${messageOf(error)}`, true);
    }
  }
}

async function loadProjectIcons(): Promise<void> {
  try {
    const response = await host.serviceRequest({ method: "GET", path: "/projects" });
    if (response.status !== 200) return;
    const data = JSON.parse(response.body) as { projects?: any[] };
    for (const item of data.projects ?? []) {
      if (!item) continue;
      const value = { icon: item.icon ?? null, color: item.color ?? null };
      if (typeof item.id === "string") iconIndex.set(item.id, value);
      if (typeof item.directory === "string") iconIndex.set(normDir(item.directory), value);
    }
  } catch {
    /* icons are optional; favicon and the monogram cover it */
  }
}

function normDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

async function loadProject(card: Card): Promise<void> {
  const [sessions, worktrees] = await Promise.all([
    host.listSessions(card.project.id).catch(() => null),
    host.listWorktrees(card.project.id).catch(() => null),
  ]);

  if (sessions) {
    const live: Session[] = sessions.sessions.filter((session: Session) => !session.archivedAt && !session.parentId);
    card.sessions = live;
    card.chats = live.length;
    card.last = live.reduce<Session | null>(
      (best, session) => (!best || session.updatedAt > best.updatedAt ? session : best),
      null,
    );
  }
  if (worktrees) card.worktrees = worktrees.worktrees.length;

  scheduleRender();
  await loadVitals(card, false);
}

async function loadVitals(card: Card, force: boolean): Promise<void> {
  try {
    const query: Record<string, string> = { directory: card.project.directory };
    if (force) query.force = "1";
    if (card.manualSite) query.site = card.manualSite;

    const response = await host.serviceRequest({ method: "GET", path: "/vitals", query });
    if (response.status !== 200) throw new Error(`service answered ${response.status}`);
    card.vitals = JSON.parse(response.body) as Vitals;
    card.vitalsError = null;
    state.serviceDown = false;
    hideNotice();

    if (!card.icon) {
      const known = iconIndex.get(card.project.id) ?? iconIndex.get(normDir(card.project.directory));
      card.icon = known?.icon ?? card.vitals.iconUrl ?? null;
      card.iconColor = card.iconColor ?? known?.color ?? null;
    }

    ensureSizePolling();
    maybeSummarize(card);
    scheduleRender();
    void recordProbes(card);
  } catch (error) {
    const code = errorCode(error);
    if (code === "NO_SERVICE" || code === "SERVICE_FAILED") {
      state.serviceDown = true;
      showNotice(
        "The local service is not running. Approve “Project Atlas” in Settings → Extensions, then retry.",
        true,
        "Retry",
        () => {
          state.cards.forEach((item) => void loadVitals(item, false));
        },
      );
    } else {
      card.vitalsError = code === "NOT_GRANTED" ? "service not approved" : messageOf(error);
    }
    scheduleRender();
  }
}

function ensureSizePolling(): void {
  const pending = state.cards.some((card) => card.vitals && card.vitals.size.state !== "ready");
  if (!pending) {
    if (state.sizeTimer) {
      clearInterval(state.sizeTimer);
      state.sizeTimer = 0;
    }
    return;
  }
  if (state.sizeTimer) return;
  state.sizePolls = 0;
  state.sizeTimer = setInterval(() => void pollSizes(), 1800);
}

async function pollSizes(): Promise<void> {
  state.sizePolls += 1;
  const pending = state.cards.filter((card) => card.vitals && card.vitals.size.state !== "ready");
  if (!pending.length || state.sizePolls > 133) {
    if (state.sizeTimer) {
      clearInterval(state.sizeTimer);
      state.sizeTimer = 0;
    }
    return;
  }
  await Promise.all(
    pending.map(async (card) => {
      try {
        const response = await host.serviceRequest({
          method: "GET",
          path: "/size",
          query: { directory: card.project.directory },
        });
        if (response.status === 200 && card.vitals) {
          card.vitals.size = JSON.parse(response.body) as SizeInfo;
        }
      } catch {
        /* the next tick retries */
      }
    }),
  );
  scheduleRender();
  ensureSizePolling();
}

/* ---------------------------------------------------------- summaries */

function maybeSummarize(card: Card): void {
  if (!state.ai || card.summary || card.summaryState !== "idle") return;
  card.summaryState = "queued";
  summaryQueue.push(card);
  void pumpSummaries();
}

async function pumpSummaries(): Promise<void> {
  if (summaryRunning) return;
  summaryRunning = true;
  while (summaryQueue.length) {
    const card = summaryQueue.shift()!;
    if (!state.ai) {
      card.summaryState = "idle";
      continue;
    }
    await writeSummary(card);
  }
  summaryRunning = false;
  scheduleRender();
}

async function writeSummary(card: Card): Promise<void> {
  card.summaryState = "loading";
  scheduleRender();
  try {
    const response = await host.serviceRequest({
      method: "GET",
      path: "/readme",
      query: { directory: card.project.directory },
    });
    const readme = response.status === 200 ? JSON.parse(response.body) : { text: "", hash: "" };
    const cached = summaryCache.get(card.project.id);
    if (cached && cached.hash && cached.hash === readme.hash) {
      card.summary = cached.text;
      card.summaryState = "idle";
      return;
    }

    const stack = card.vitals?.stack ?? [];
    if (!readme.text && stack.length < 2) {
      card.summaryState = "idle";
      return;
    }

    const { text } = await host.generate({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(card, readme.text),
      maxOutputTokens: 160,
    });
    const clean = String(text ?? "")
      .trim()
      .replace(/^["“]|["”]$/g, "")
      .trim();
    if (!clean) throw new Error("empty summary");

    card.summary = clean;
    card.summaryState = "idle";
    if (readme.hash) {
      summaryCache.set(card.project.id, { text: clean, hash: readme.hash });
      await host.storage
        .set(`${SUMMARY_PREFIX}${card.project.id}`, { text: clean, hash: readme.hash, at: Date.now() })
        .catch(() => {});
    }
  } catch (error) {
    const code = errorCode(error);
    card.summaryState = "error";
    if (code === "NOT_GRANTED" || code === "NO_MODEL") {
      state.ai = false;
      aiEl.checked = false;
      showNotice(
        "Project Atlas cannot write blurbs: allow the “model” permission, or pick a Small Model in Settings → Sessions.",
        false,
      );
    }
  }
}

function buildPrompt(card: Card, readme: string): string {
  const lines = [
    `Project name: ${card.project.name}`,
    `Folder: ${card.project.directory}`,
    `Stack: ${(card.vitals?.stack ?? []).join(", ") || "unknown"}`,
  ];
  if (card.vitals?.site) lines.push(`Live site: ${card.vitals.site}`);
  if (card.vitals?.web) lines.push(`Repository: ${card.vitals.web}`);
  if (readme) lines.push("", "README:", readme.slice(0, 6000));
  return lines.join("\n");
}

/* ------------------------------------------------------------ actions */

function findCard(id: string | undefined): Card | undefined {
  return id ? state.cards.find((card) => card.project.id === id) : undefined;
}

gridEl.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target) return;

  if (target.dataset.act === "collapse") {
    const key = target.dataset.section ?? "";
    state.collapsed[key] = !state.collapsed[key];
    if (!state.collapsed[key]) delete state.collapsed[key];
    void saveSettings();
    render();
    return;
  }

  const id =
    target.closest<HTMLElement>(".card")?.dataset.id ??
    (state.view === "project" ? state.viewId ?? undefined : undefined);
  const card = findCard(id);
  if (!card) return;

  if (target.dataset.act === "deploy") {
    const url = target.dataset.url;
    if (url) void openLink(url);
    return;
  }

  void runAction(card, target.dataset.act ?? "");
});

gridEl.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.matches("[data-site-input]")) {
    const card = findCard(input.dataset.siteInput);
    if (card) card.siteDraft = input.value;
    return;
  }
  if (input.matches("[data-group-input]")) {
    const card = findCard(input.dataset.groupInput);
    if (card) card.groupDraft = input.value;
  }
});

async function saveSettings(): Promise<void> {
  const settings: Settings = { ai: state.ai, groupOn: state.groupOn, collapsed: state.collapsed, showHidden: state.showHidden };
  await host.storage.set(SETTINGS_KEY, settings).catch(() => {});
}

/** One storage key per project; removed again once it holds only defaults. */
async function persistMeta(card: Card): Promise<void> {
  const group = card.meta.group?.trim() ? card.meta.group.trim() : null;
  card.meta.group = group;
  const empty = !card.meta.pinned && !group && !card.meta.hidden;
  metaCache.set(card.project.id, { ...card.meta });
  if (empty) {
    metaCache.delete(card.project.id);
    await host.storage.delete(`${META_PREFIX}${card.project.id}`).catch(() => {});
  } else {
    await host.storage
      .set(`${META_PREFIX}${card.project.id}`, { pinned: card.meta.pinned ?? false, group, hidden: card.meta.hidden ?? false })
      .catch(() => {});
  }
}

async function saveGroup(card: Card): Promise<void> {
  card.meta.group = card.groupDraft.trim() || null;
  card.editingGroup = false;
  await persistMeta(card);
  render();
}

async function runAction(card: Card, act: string): Promise<void> {
  switch (act) {
    case "detail":
      state.view = "project";
      state.viewId = card.project.id;
      state.range = 30;
      state.activity = null;
      state.activityState = "idle";
      state.activityFor = null;
      state.git = null;
      state.gitState = "idle";
      state.gitFor = null;
      render();
      void loadActivity(card, 30);
      void loadGit(card);
      return;
    case "back":
      state.view = "board";
      state.viewId = null;
      render();
      return;
    case "range-7":
    case "range-30":
    case "range-90": {
      const days = Number(act.slice("range-".length)) || 30;
      state.range = days;
      state.activity = null;
      state.activityState = "idle";
      render();
      void loadActivity(card, days);
      return;
    }
    case "open":
      return openProject(card);
    case "new":
      return newChat(card);
    case "folder":
      return revealFolder(card);
    case "files":
      return openSurface("files");
    case "git":
      return openSurface("git");
    case "github":
      if (card.vitals?.web) await openLink(card.vitals.web);
      return;
    case "copy":
      await host.writeClipboard(card.project.directory).catch(() => {});
      toast("success", "Folder path copied");
      return;
    case "edit-site":
      card.editingSite = true;
      card.editingGroup = false;
      card.siteDraft = card.manualSite ?? "";
      render();
      return;
    case "cancel-site":
      card.editingSite = false;
      render();
      return;
    case "save-site":
      return saveSite(card);
    case "pin":
      card.meta.pinned = !card.meta.pinned;
      await persistMeta(card);
      render();
      return;
    case "hide":
      card.meta.hidden = true;
      await persistMeta(card);
      render();
      return;
    case "unhide":
      card.meta.hidden = false;
      await persistMeta(card);
      render();
      return;
    case "edit-group":
      card.editingGroup = true;
      card.editingSite = false;
      card.groupDraft = card.meta.group ?? "";
      render();
      return;
    case "cancel-group":
      card.editingGroup = false;
      render();
      return;
    case "save-group":
      return saveGroup(card);
    case "check-now":
      toast("info", "Re-checking deployments…");
      await loadVitals(card, true);
      render();
      return;
    case "rewrite": {
      card.summary = null;
      card.summaryState = "idle";
      summaryCache.delete(card.project.id);
      scheduleRender();
      summaryQueue.push(card);
      void pumpSummaries();
      return;
    }
  }
}

async function openProject(card: Card): Promise<void> {
  try {
    if (card.last) {
      await host.openSession(card.last.id);
      return;
    }
    await host.startSession({
      providerId: "project-atlas",
      id: card.project.id,
      title: card.project.name,
      url: fileUrl(card.project.directory),
      projectId: card.project.id,
      navigation: "open",
      text: `Give me a tour of this project (${card.project.directory}): what it does and how it is built.`,
    });
  } catch (error) {
    toast("error", messageOf(error));
  }
}

async function newChat(card: Card): Promise<void> {
  try {
    await host.startSession({
      providerId: "project-atlas",
      id: card.project.id,
      title: card.project.name,
      url: fileUrl(card.project.directory),
      projectId: card.project.id,
      navigation: "open",
      text: `Explain the architecture of this project (${card.project.directory}).`,
    });
  } catch (error) {
    toast("error", messageOf(error));
  }
}

async function revealFolder(card: Card): Promise<void> {
  try {
    const response = await host.serviceRequest({
      method: "POST",
      path: "/reveal",
      body: JSON.stringify({ directory: card.project.directory }),
    });
    if (response.status === 200) toast("success", "Opened in the file manager");
    else toast("error", "Could not open the folder");
  } catch (error) {
    toast("error", messageOf(error));
  }
}

async function openSurface(id: string): Promise<void> {
  try {
    await host.openSurface(id);
  } catch (error) {
    const code = errorCode(error);
    toast("error", code === "UNSUPPORTED" ? "This screen is not available here" : messageOf(error));
  }
}

async function openLink(url: string): Promise<void> {
  try {
    await host.openUrl(url);
  } catch (error) {
    toast("error", messageOf(error));
  }
}

async function saveSite(card: Card): Promise<void> {
  const raw = card.siteDraft.trim();
  card.editingSite = false;

  if (!raw) {
    siteCache.delete(card.project.id);
    card.manualSite = null;
    await host.storage.delete(`${SITE_PREFIX}${card.project.id}`).catch(() => {});
    render();
    void loadVitals(card, false);
    return;
  }

  let value = raw;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) throw new Error("bad url");
    value = parsed.toString().replace(/\/$/, "");
  } catch {
    toast("error", "That does not look like a web address");
    card.editingSite = true;
    render();
    return;
  }

  siteCache.set(card.project.id, value);
  card.manualSite = value;
  await host.storage.set(`${SITE_PREFIX}${card.project.id}`, { site: value }).catch(() => {});
  render();
  void loadVitals(card, false);
}

/* ------------------------------------------------------------- helpers */

function activityState(last: Session | null): string {
  if (!last) return "none";
  if (last.activity === "running" || last.activity === "retrying") return "running";
  if (last.activity === "waiting-permission" || last.activity === "waiting-question") return "waiting";
  if (last.unread) return "unread";
  if (last.activity === "idle") return "idle";
  return "none";
}

function activityTitle(last: Session | null): string {
  if (!last) return "No chats yet";
  if (last.activity === "waiting-permission") return "Waiting for your permission";
  if (last.activity === "waiting-question") return "Waiting for your answer";
  if (last.activity === "running") return "Agent is working";
  if (last.activity === "retrying") return "Retrying";
  if (last.unread) return "Unread reply";
  return last.title;
}

function ago(timestamp?: number | null): string {
  if (!timestamp) return "";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks}w`;
  return `${Math.round(days / 30)}mo`;
}

function sizeLabel(card: Card): string {
  const size = card.vitals?.size;
  if (!size || size.state === "none") return "size —";
  if (size.state === "running") return size.bytes != null ? `${bytes(size.bytes)}…` : "measuring…";
  if (size.bytes == null) return "size —";
  return `${bytes(size.bytes)}${size.truncated ? "+" : ""}`;
}

function bytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function fileUrl(directory: string): string {
  return `file:///${directory.replace(/\\/g, "/").replace(/^\/+/, "")}`;
}

function errorCode(error: unknown): string {
  return error instanceof HostRequestError ? error.code : "";
}

function messageOf(error: unknown): string {
  if (error instanceof HostRequestError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function toast(kind: "info" | "success" | "error", message: string): void {
  void host.toast({ kind, message }).catch(() => {});
}

function showNotice(text: string, error = false, actionLabel?: string, action?: () => void): void {
  noticeEl.replaceChildren(document.createTextNode(text));
  noticeEl.className = `notice show${error ? " error" : ""}`;
  if (actionLabel && action) {
    const button = document.createElement("button");
    button.textContent = actionLabel;
    button.addEventListener("click", action);
    noticeEl.append(button);
  }
}

function hideNotice(): void {
  if (!state.serviceDown) noticeEl.className = "notice";
}

/* ---------------------------------------------------------------- init */

searchEl.addEventListener("input", () => {
  state.query = searchEl.value;
  scheduleRender();
});

sortEl.addEventListener("change", () => {
  state.sort = sortEl.value;
  scheduleRender();
});

aiEl.addEventListener("change", () => {
  state.ai = aiEl.checked;
  void saveSettings();
  if (state.ai) {
    for (const card of state.cards) maybeSummarize(card);
  } else {
    summaryQueue.length = 0;
  }
  scheduleRender();
});

groupEl.addEventListener("click", () => {
  state.groupOn = !state.groupOn;
  void saveSettings();
  render();
});

hiddenEl.addEventListener("click", () => {
  state.showHidden = !state.showHidden;
  void saveSettings();
  render();
});

refreshEl.addEventListener("click", () => {
  refreshEl.disabled = true;
  void Promise.all(state.cards.map((card) => loadVitals(card, true))).finally(() => {
    refreshEl.disabled = false;
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== searchEl) {
    event.preventDefault();
    searchEl.focus();
  }
});

let mounted = false;

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  state.directory = ctx.directory;
  state.surface = ctx.surface;
  document.body.dataset.surface = ctx.surface;

  if (mounted) {
    scheduleRender();
    return;
  }
  mounted = true;
  void boot();
});

host.onDirectory((directory) => {
  state.directory = directory;
  scheduleRender();
});

# How Project Atlas works

Project Atlas is two halves:

- **The panel** (`panel/`) is a sandboxed page. It can draw, call the OpenChamber Host API,
  and ask its own service for data. It cannot read the disk, run a process or fetch the
  network.
- **The service** (`service/`) is a local HTTP server that OpenChamber starts on demand. It
  runs with your user rights, does the filesystem and `git` work, and answers the panel over
  loopback only.

That split is deliberate: every read that needs a path goes through one small, auditable
process instead of widening the panel's sandbox.

## The panel

The Host API provides:

| Call | Used for |
| --- | --- |
| `listProjects()` | the board's rows |
| `listSessions(projectId)` | chats, last activity, unread, running/waiting |
| `listWorktrees(projectId)` | the worktree count |
| `openSession(id)` | **Resume** |
| `startSession({ … })` | **Start chat** / **New chat** |
| `openSurface("files" \| "git")` | the Files and Git buttons |
| `openUrl(url)` | GitHub, deployments |
| `writeClipboard(text)` | **Copy path** |
| `generate({ … })` | the AI blurb |
| `storage` | manual site URLs, blurb cache, settings, pins/groups/hidden, probe history |
| `serviceRequest({ … })` | everything the service answers |

Project **icons are not exposed by the Host API**. Instead of scraping, the service reads
OpenChamber's own store, so the image matches the project list exactly.

## The service

It listens on `127.0.0.1:$OPENCHAMBER_SERVICE_PORT` and requires
`Authorization: Bearer $OPENCHAMBER_SERVICE_TOKEN` on every route except `/health`.

| Route | Returns |
| --- | --- |
| `GET /health` | `{ ok: true }`, the readiness probe |
| `GET /vitals?directory=…` | branch, dirty, remote, ahead/behind, stack, deployments (live, ms, cert), favicon, size state |
| `GET /git?directory=…&force=` | 182-day commit series, streaks, last commit, sync state |
| `GET /size?directory=…` | disk usage state, starting the background walk if needed |
| `GET /readme?directory=…` | up to 8 KB of README plus a change hash |
| `GET /projects` | project list, icons and colours from OpenChamber's settings |
| `GET /activity?directory=…&projectId=…&days=N` | daily activity, totals, plans and todos |
| `GET /inbox` | open todos and open plan steps across every project |
| `GET /spend?directory=…&days=N` | model tokens, cost and per-model share |
| `GET /disk?directory=…&force=` | size by category plus the largest root children |
| `POST /reveal` | open the folder in Explorer / Finder, or a path inside it |
| `POST /refresh` | drop the cached facts, git history and size for one folder |

Paths must be absolute. A relative path is a `400` — the service has no "current project".

### Data sources

| Feature | Read |
| --- | --- |
| Branch, dirty count, remote | `git rev-parse`, `git status --porcelain`, `git config remote.origin.url` |
| Ahead/behind, upstream | `git rev-parse … @{u}`, `git rev-list --left-right --count @{u}...HEAD` |
| Stale dirty files | oldest `mtime` among the files in `git status --porcelain` (capped at 100) |
| Commit heatmap | `git log --all --since=<182 days ago> --pretty=format:%ad --date=short -n 50000` |
| Last commit | `git log -1 --pretty=format:%H%x1f%s%x1f%at` |
| Disk size | recursive `readdir`/`stat`, 12 s / 300k file budget, one project at a time |
| Stack | `package.json`, `composer.json`, marker files, lockfiles |
| Deployments | `CNAME`, `homepage`, `.env*`, `fly.toml`, `wrangler.toml`, `.firebaserc`, `render.yaml`, `gh-pages`, manual URL |
| Live status | `GET` on the deployment URL, 4.5 s timeout, redirects followed |
| TLS certificate | `node:tls` connect to host:443 with SNI, 4 s timeout, verification off |
| Activity | `opencode stats --json --full --days N --project .`, run in the project folder |
| Spend | `opencode stats --json --full --cost --models --days N --project .` (at most two at once) |
| Plans and todos | `~/.config/openchamber/projects/<project id>/context.json` and its markdown plans |
| Inbox | every project's `context.json` plus each plan's markdown (open todos, `- [ ]` lines) |
| Disk breakdown | same walker as size; segments matched to `node_modules`, `vendor`, `.git`, build output, caches, virtualenvs |
| Icon | `~/.config/openchamber/project-icons/project-<sha1(project id)>.<ext>` |
| Colour | `iconBackground` or `color` from `settings.json` |

The config directory is `~/.config/openchamber`, or
`$XDG_CONFIG_HOME/openchamber` when that is set.

### Caching

| Data | TTL |
| --- | --- |
| Git, stack, deployments | 30 s |
| Git history (`/git`) | 2 min per directory |
| Disk size | 12 h |
| Deployment probe (live, ms, cert) | 10 min (`force=1` on `/vitals` re-probes) |
| Projects and icons | 2 min |
| Activity | 2 min per project and range |
| Spend | 5 min per directory and range |
| Inbox | 60 s for the whole list |
| Disk breakdown | 12 h per directory (`force=1` re-walks) |
| Plans and todos | 60 s |

Sizes are measured in the background and cached; a partial walk is reported with `+` and a
`truncated` flag. The panel polls `/size` while a measurement is running.

## Activity and plans

`opencode stats` returns a daily series (`{ date, steps }`) plus totals. The service fills
missing days so the graph always has one bar per day, and returns `available: false` when the
CLI cannot be found — the plans section still works.

Plan progress is counted from Markdown checkboxes (`- [ ]`, `- [x]`) in each plan file named
by `context.json`. Open todos come from the same file. These are OpenChamber's internal
formats; an unknown shape degrades to "no notes, todos or plans" rather than failing.

## Commits, sync and deployments

`/git` gap-fills the last 182 days (`{ date, commits }`), so the heatmap always has one
cell per day, and returns `available: false` for non-repo folders. Streaks count consecutive
commit days (the current one tolerates today being empty); the log is capped at 50 000 lines.

The `/vitals` payload also carries the cheap sync state (`ahead`, `behind`, `dirtySince`,
`detached`) so cards can show `↑N` / `↓N` chips without a second request. `dirtySince` is
the oldest `mtime` among changed files; the card only flags it from 3 days up.

Each deployment probe records response time (`ms`) and, for `https` URLs only, the TLS
certificate (`validTo`, `daysLeft`, issuer CN/O, whether the chain verified). Verification
is off so expired or self-signed certificates are reported rather than failing. The panel
appends `{ at, live, ms }` per URL to `atlas:v1:probes:<projectId>` after each vitals load
(capped at 40 entries, no append within 5 minutes) and derives "down since" from the current
trailing run of failures. The UI says what it is: checks observed while Atlas is open, not
continuous monitoring. A down deployment adds 500 to the "Needs me" score; an invalid or
soon-expiring (≤ 7 days) certificate adds 400.

## Pins, groups and hidden projects

One storage key per project, `atlas:v1:meta:<projectId>` =
`{ pinned, group, hidden }`, deleted again when it holds only defaults. Board settings
(group on/off, collapsed sections, show-hidden, density, the Board/Inbox/Spend tab) live in
`atlas:v1:settings` next to the AI toggle. Search also matches the group name; hidden
projects leave the footer count. Minimal density hides stats and descriptions but never a
problem chip, and the project page always renders in full.

## Inbox, spend and disk

`/inbox` walks every known project's `context.json` (open todos) and each plan markdown
(open `- [ ]` lines, with the plan title and file). Malformed files are skipped, never
thrown; the list caps at 1000 items with a `truncated` flag. The panel shows 150 rows at a
time behind "Show N more" and says it is read-only: OpenChamber owns those lists.

`/spend` parses `tokens` (`input`, `output`, `reasoning`, `cache.read`, `cache.write`),
`sessions`, `cost` and the `models` array defensively — missing or oddly shaped fields
become 0 or are skipped. Many setups report `cost: 0` (free or unpriced models), so the
panel leads with tokens and prints `not reported` for cost. At most two stats processes run
at once across requests; the board Spend tab loads projects one by one with a progress hint.

`/disk` reuses the size walker's 12 s / 300k-file budget and attributes each file to the
category of its shallowest matching directory segment, so a nested `node_modules` counts
once. Reclaimable means regenerable (everything except `.git` and source). Rows carry
relative paths; **Reveal** accepts only paths inside the project (absolute paths, `..`
escapes and sibling-prefix tricks like `<project>-evil` are `400`s). The panel never
deletes — there is no delete route.

## Privacy and network

- No telemetry, no analytics, no accounts.
- Outbound network requests happen only for deployment checks: one `GET` per detected URL
  (4.5 s timeout) plus a short TLS handshake to port 443 to read the certificate (4 s
  timeout), both from your machine.
- The service reads the paths the panel sends, OpenChamber's config directory, and the
  project's own files. It writes nothing except through OpenChamber's UI actions.
- The service token and OpenChamber's host token never reach the panel.

## Limits

- `openSurface` targets the open project, so **Files** and **Git** appear only on that
  project's card.
- Steps count agent steps, not minutes or commits — the **Commits** panel is the honest signal.
- The probe history only records checks observed while Atlas is open (one entry per URL per
  5 minutes, 40 kept); it is not continuous monitoring.
- The activity graph and spend need `opencode` on `PATH`; the app's bundled CLI is tried
  as a fallback on Windows. Without it, spend reports no usage.
- Spend cost is often `0` (free or unpriced models) — tokens are the primary metric.
- Deployment detection only sees what is committed in the repo (and `.env` files). Many
  WordPress and client sites need **+ site**.
- VS Code does not load OpenChamber extensions. The mobile app does, for the panel and page
  that opt in, which this one does.
- A service keeps running the code it started with; toggle the extension off and on after a
  rebuild.

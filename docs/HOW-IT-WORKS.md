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
| `storage` | manual site URLs, blurb cache, the AI toggle |
| `serviceRequest({ … })` | everything the service answers |

Project **icons are not exposed by the Host API**. Instead of scraping, the service reads
OpenChamber's own store, so the image matches the project list exactly.

## The service

It listens on `127.0.0.1:$OPENCHAMBER_SERVICE_PORT` and requires
`Authorization: Bearer $OPENCHAMBER_SERVICE_TOKEN` on every route except `/health`.

| Route | Returns |
| --- | --- |
| `GET /health` | `{ ok: true }`, the readiness probe |
| `GET /vitals?directory=…` | branch, dirty, remote, stack, deployments, favicon, size state |
| `GET /size?directory=…` | disk usage state, starting the background walk if needed |
| `GET /readme?directory=…` | up to 8 KB of README plus a change hash |
| `GET /projects` | project list, icons and colours from OpenChamber's settings |
| `GET /activity?directory=…&projectId=…&days=N` | daily activity, totals, plans and todos |
| `POST /reveal` | open the folder in Explorer / Finder |
| `POST /refresh` | drop the cached facts and size for one folder |

Paths must be absolute. A relative path is a `400` — the service has no "current project".

### Data sources

| Feature | Read |
| --- | --- |
| Branch, dirty count, remote | `git rev-parse`, `git status --porcelain`, `git config remote.origin.url` |
| Disk size | recursive `readdir`/`stat`, 12 s / 300k file budget, one project at a time |
| Stack | `package.json`, `composer.json`, marker files, lockfiles |
| Deployments | `CNAME`, `homepage`, `.env*`, `fly.toml`, `wrangler.toml`, `.firebaserc`, `render.yaml`, `gh-pages`, manual URL |
| Live status | `GET` on the deployment URL, 4.5 s timeout, redirects followed |
| Activity | `opencode stats --json --full --days N --project .`, run in the project folder |
| Plans and todos | `~/.config/openchamber/projects/<project id>/context.json` and its markdown plans |
| Icon | `~/.config/openchamber/project-icons/project-<sha1(project id)>.<ext>` |
| Colour | `iconBackground` or `color` from `settings.json` |

The config directory is `~/.config/openchamber`, or
`$XDG_CONFIG_HOME/openchamber` when that is set.

### Caching

| Data | TTL |
| --- | --- |
| Git, stack, deployments | 30 s |
| Disk size | 12 h |
| Deployment probe | 10 min |
| Projects and icons | 2 min |
| Activity | 2 min per project and range |
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

## Privacy and network

- No telemetry, no analytics, no accounts.
- Outbound network requests happen only for deployment checks (one `GET` per detected URL)
  and, if you enable blurbs, the Small Model call made by OpenChamber.
- The service reads the paths the panel sends, OpenChamber's config directory, and the
  project's own files. It writes nothing except through OpenChamber's UI actions.
- The service token and OpenChamber's host token never reach the panel.

## Limits

- `openSurface` targets the open project, so **Files** and **Git** appear only on that
  project's card.
- Steps count agent steps, not minutes or commits.
- The activity graph needs `opencode` on `PATH`; the app's bundled CLI is tried as a fallback
  on Windows.
- Deployment detection only sees what is committed in the repo (and `.env` files). Many
  WordPress and client sites need **+ site**.
- VS Code does not load OpenChamber extensions. The mobile app does, for the panel and page
  that opt in, which this one does.
- A service keeps running the code it started with; toggle the extension off and on after a
  rebuild.

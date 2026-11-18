# Changelog

## 0.5.0

- **Git heatmap and health** — the project page gains a **Commits** panel (26-week
  GitHub-style heatmap, streaks, last commit, sync state) served by a new `GET /git`
  route. Cards show `↑N` / `↓N` chips for unpushed / behind commits and a `dirty Nd`
  warning when uncommitted changes are at least 3 days old.
- **Pins, groups and archive** — pin cards with the star, group them with the
  `+ group` chip (header **Group: On/Off** renders Pinned / group / Ungrouped
  sections), and **Hide** projects you do not want on the board. Pinned first in
  "Needs me" sort; hidden projects leave the footer count.
- **SSL and uptime for deployments** — probes now record response time and, for
  `https` URLs, TLS certificate details (expiry, days left, issuer) via a short
  `node:tls` handshake. Cards show a `cert 9d` / `cert expired` badge; the new
  **Deployments** panel lists status, latency, cert dates, recent-check dots and
  "down since", with a **Check now** button. Down or soon-expiring deployments
  boost the "Needs me" sort. History is only "checks observed while Atlas is open",
  capped at 40 entries per URL.

## Unreleased

- README screenshots, generated from invented projects by a demo harness (`demo/`) that runs
  the real panel against a mock host. `npm run screenshots` regenerates them.

## 0.4.0

- Project page: click a project name to see 7/30/90-day activity, totals, plans and open
  todos. **← All projects** returns to the board.
- Activity comes from `opencode stats`; plans and todos from OpenChamber's project knowledge.

## 0.3.0

- Project icons now match the project list exactly: read from OpenChamber's `settings.json`
  and `project-icons/`, with a favicon and a coloured initial as fallbacks.
- Dropped the `opencode` permission role; icons no longer depend on the OpenCode API.

## 0.2.0

- Deployment detection (`CNAME`, `homepage`, `.env`, `fly.toml`, `wrangler.toml`,
  `.firebaserc`, `render.yaml`, `gh-pages`) with live probes and clickable chips.
- Manual **+ site** per project, also probed.
- Project icons via favicon where available.

## 0.1.0

- First board: projects, sessions, worktrees, size, branch, stack, GitHub link.
- Local service for git, disk usage and Explorer.
- AI blurb per project with a Small Model, cached by README hash.

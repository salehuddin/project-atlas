# Changelog

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

# Contributing

Thanks for taking a look. Project Atlas is small on purpose; the fastest way to keep it
healthy is to keep it that way.

## Reporting a bug

Open an issue with:

- OpenChamber version and OS.
- Which part of the extension (board, project page, deployments, icons, plans).
- What you expected and what happened.
- Anything the extension showed: a toast, a banner, or the code in an error
  (`NOT_GRANTED`, `NO_SERVICE`, `SERVICE_FAILED`).

If the local service is the problem, this helps:

```sh
node scripts/smoke.mjs "<project folder>"
```

## Pull requests

1. Fork and branch.
2. Keep the panel dependency-free — DOM, no framework, no new runtime packages.
3. Reads only. The extension does not write, delete, or move files.
4. Run:

   ```sh
   npm ci
   npm test
   npm run build
   npm run check
   ```

5. Commit the built files (`panel/main.js`, `service/main.js`, `panel/index.html`) with the
   source. OpenChamber does not build extensions.
6. Add a `CHANGELOG.md` entry and bump `version` if behaviour changes.

## Style

- TypeScript, two-space indent, double quotes.
- Small functions; a comment where the reason is not obvious, not where it is.
- The service must validate every incoming path with `safeDir()`.
- No secrets in code, tests or issues.

## Screenshots

UI changes are easier to review with a before/after screenshot. Drag them into the PR.

/**
 * Stand-in for `@openchamber/sdk`, used only by the demo harness.
 *
 * The real panel talks to OpenChamber through `connectHost()`. Here every call
 * is answered from `fixtures.ts`, so the actual panel code can render in a
 * plain browser with invented projects. Nothing in `src/` is changed or
 * copied: the demo build swaps this module in for the SDK at bundle time.
 */
import { DEMO_DIRECTORY, DEMO_SUMMARY_KEYS, DEMO_META_KEYS, DEMO_PROBE_KEYS, handleService, listProjects, listSessions, listWorktrees } from "./fixtures";

export class HostRequestError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const params = new URLSearchParams(location.search);

export function connectHost() {
  const storage = new Map<string, unknown>([...DEMO_SUMMARY_KEYS, ...DEMO_META_KEYS, ...DEMO_PROBE_KEYS]);
  const ok = async () => undefined;

  return {
    onReady(listener: (ctx: unknown) => void) {
      setTimeout(
        () =>
          listener({
            directory: DEMO_DIRECTORY,
            surface: params.get("surface") === "panel" ? "panel" : "page",
            theme: params.get("theme") === "light" ? "light" : "dark",
          }),
        0,
      );
      return () => {};
    },
    onDirectory: () => () => {},

    listProjects: async () => listProjects(),
    listSessions: async (projectId: string) => listSessions(projectId),
    listWorktrees: async (projectId: string) => listWorktrees(projectId),

    serviceRequest: async (request: { path: string; query?: Record<string, string>; method?: string }) =>
      handleService(request.path, request.query ?? {}),

    generate: async () => ({ text: "A demo project." }),

    storage: {
      get: async (key: string) => storage.get(key) ?? null,
      set: async (key: string, value: unknown) => void storage.set(key, value),
      delete: async (key: string) => void storage.delete(key),
      keys: async () => [...storage.keys()],
    },

    toast: ok,
    openUrl: ok,
    openSurface: ok,
    openSession: ok,
    startSession: ok,
    writeClipboard: ok,
  };
}

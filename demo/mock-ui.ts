/** Stand-in for `@openchamber/sdk/ui`: applies a fixed theme instead of the host's. */

const THEMES: Record<string, Record<string, string>> = {
  dark: {
    "--oc-bg": "#141417",
    "--oc-elevated": "#1c1c21",
    "--oc-fg": "#ececf1",
    "--oc-muted": "#8e8e9a",
    "--oc-subtle": "#6b6b76",
    "--oc-border": "#2c2c34",
    "--oc-hover": "#26262d",
    "--oc-muted-surface": "#212128",
    "--oc-primary": "#8aa0ff",
    "--oc-primary-fg": "#10131f",
    "--oc-primary-text": "#aab9ff",
    "--oc-success": "#3fa06b",
    "--oc-warning": "#c38a2a",
    "--oc-error": "#d4544e",
    "--oc-info": "#3f8fdd",
    "--oc-warning-text": "#e0a94f",
    "--oc-error-text": "#f08a85",
  },
  light: {
    "--oc-bg": "#fafafb",
    "--oc-elevated": "#ffffff",
    "--oc-fg": "#1a1a1f",
    "--oc-muted": "#6b6b76",
    "--oc-subtle": "#8e8e9a",
    "--oc-border": "#e1e1e6",
    "--oc-hover": "#f0f0f4",
    "--oc-muted-surface": "#f2f2f6",
    "--oc-primary": "#4f63e6",
    "--oc-primary-fg": "#ffffff",
    "--oc-primary-text": "#3a4bcc",
    "--oc-success": "#2c8a58",
    "--oc-warning": "#a8710f",
    "--oc-error": "#c8423c",
    "--oc-info": "#2d7fd0",
    "--oc-warning-text": "#8a5a00",
    "--oc-error-text": "#b02f29",
  },
};

export function applyHostReady(ctx: { theme?: string }, root: HTMLElement): void {
  const theme = THEMES[ctx.theme ?? "dark"] ?? THEMES.dark;
  for (const [name, value] of Object.entries(theme)) root.style.setProperty(name, value);
  root.style.setProperty("--oc-font", '"Segoe UI", system-ui, -apple-system, sans-serif');
  root.style.setProperty("--oc-radius", "10px");
  root.style.colorScheme = ctx.theme === "light" ? "light" : "dark";
}

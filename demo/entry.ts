/**
 * Demo entry: loads the real panel code (its imports are swapped for mocks at
 * build time), then optionally opens a project page for the screenshots.
 *
 *   index.html?theme=light              light theme
 *   index.html?surface=panel            narrow right-hand rail layout
 *   index.html#project=Lumen%20Bakery   open that project's page
 */
import "../src/panel/main.ts";

const target = decodeURIComponent(location.hash.replace(/^#project=/, ""));

if (location.hash.startsWith("#project=") && target) {
  const timer = setInterval(() => {
    const names = [...document.querySelectorAll<HTMLButtonElement>(".card .name")];
    const match = names.find((button) => button.textContent === target);
    if (!match) return;
    clearInterval(timer);
    match.click();
  }, 50);
}

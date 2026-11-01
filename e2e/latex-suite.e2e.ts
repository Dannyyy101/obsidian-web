import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { activeEditor, activeView, expect, expectOpen, openFromExplorer, openVault, readFixtureVault, seedVault, test } from "./fixtures";

const ID = "obsidian-latex-suite";
const PLUGIN_DIR = `public/bundled-plugins/${ID}`;

/** Öffnet einen Vault mit aktiviertem Latex Suite und einer Notiz `Formeln.md`. */
async function openWithPlugin(page: Page, vaultName: string, content: string) {
  await page.goto("/");
  await seedVault(page, vaultName, [
    ...readFixtureVault(),
    ...["manifest.json", "main.js", "styles.css"].map((file) => ({
      path: `.obsidian/plugins/${ID}/${file}`,
      content: readFileSync(`${PLUGIN_DIR}/${file}`, "utf8"),
    })),
    { path: ".obsidian/community-plugins.json", content: JSON.stringify([ID]) },
    { path: "Formeln.md", content },
  ]);
  await openVault(page, vaultName);
  await openFromExplorer(page, "Formeln.md");
  await expectOpen(page, "Formeln.md");
}

test("Latex Suite expandiert Snippets und zeigt die Formelvorschau", async ({ page, vaultName }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  await openWithPlugin(page, vaultName, "");

  const editor = activeEditor(page);
  // `${}…{}$` statt `$…$` ist Absicht von Latex Suite (kein Flackern beim Tippen von Leerzeichen).
  // Latex Suite lädt in `onload` erst MathJax und registriert danach seine Editor-Erweiterung. Unter
  // Last ist der Editor schon vorher offen, deshalb bis dahin neu tippen.
  await expect(async () => {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("Sei mk");
    await expect(editor).toContainText("Sei ${}{}$", { timeout: 500 });
  }).toPass();
  await page.keyboard.type("//");
  await page.keyboard.type("1");
  await page.keyboard.press("Tab");
  await page.keyboard.type("@a");
  await expect(editor).toContainText("Sei ${}\\frac{1}{\\alpha}{}$");

  // Vorschau der Formel unter dem Cursor, gerendert mit KaTeX, samt Cursor-Markierung (`\class`).
  const tooltip = page.locator(".cm-tooltip .katex");
  await expect(tooltip).toBeVisible();
  await expect(page.locator(".cm-tooltip .mjx-latex-suite-cursor")).toHaveCount(1);
  await expect(page.locator(".cm-tooltip .katex-error")).toHaveCount(0);

  // Einstellungsreiter des Plugins mit seinem eigenen CodeMirror-Snippet-Editor.
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+,");
  await page.locator(".vertical-tab-nav-item", { hasText: "Latex Suite" }).click();
  await expect(page.locator(".snippets-editor-wrapper .cm-editor").first()).toBeVisible();
  await expect(activeView(page)).toBeAttached();

  expect(errors).toEqual([]);
});

test("Latex Suite expandiert keine Snippets in Codeblöcken", async ({ page, vaultName }) => {
  await openWithPlugin(page, vaultName, "```js\n\n```\n");
  const editor = activeEditor(page);
  // Erst hinter dem Codeblock prüfen, dass das Plugin geladen ist (siehe oben).
  await expect(async () => {
    await editor.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("mk");
    await expect(editor).toContainText("${}{}$", { timeout: 500 });
  }).toPass();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("mk @a");
  await expect(editor.locator(".HyperMD-codeblock", { hasText: "mk @a" })).toHaveCount(1);
  await expect(editor).not.toContainText("\\alpha");
});

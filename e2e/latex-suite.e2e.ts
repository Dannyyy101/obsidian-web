import { readFileSync } from "node:fs";
import { activeEditor, activeView, expect, expectOpen, openFromExplorer, openVault, readFixtureVault, seedVault, test } from "./fixtures";

const ID = "obsidian-latex-suite";
const PLUGIN_DIR = `public/bundled-plugins/${ID}`;

test("Latex Suite expandiert Snippets und zeigt die Formelvorschau", async ({ page, vaultName }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  await page.goto("/");
  await seedVault(page, vaultName, [
    ...readFixtureVault(),
    ...["manifest.json", "main.js", "styles.css"].map((file) => ({
      path: `.obsidian/plugins/${ID}/${file}`,
      content: readFileSync(`${PLUGIN_DIR}/${file}`, "utf8"),
    })),
    { path: ".obsidian/community-plugins.json", content: JSON.stringify([ID]) },
    { path: "Formeln.md", content: "" },
  ]);
  await openVault(page, vaultName);
  await openFromExplorer(page, "Formeln.md");
  await expectOpen(page, "Formeln.md");

  const editor = activeEditor(page);
  await editor.locator(".cm-line").last().click();
  // `${}…{}$` statt `$…$` ist Absicht von Latex Suite (kein Flackern beim Tippen von Leerzeichen).
  await page.keyboard.type("Sei mk");
  await expect(editor).toContainText("Sei ${}{}$");
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

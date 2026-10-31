import { activeEditor, activeView, expect, openFromExplorer, test } from "./fixtures";

test("Codeblöcke werden hervorgehoben und haben einen Kopieren-Knopf", async ({ vault: page }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  const editor = activeEditor(page);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\n```js\nconst a = 1;\n```\n\nEnde");
  await expect(editor.locator(".HyperMD-codeblock .cm-keyword", { hasText: "const" })).toBeVisible();
  await expect(editor.locator(".code-block-flair")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+E");
  const reading = activeView(page).locator(".markdown-reading-view");
  await expect(reading.locator("pre code .token.keyword", { hasText: "const" })).toBeVisible();
  await expect(reading.locator("pre .copy-code-button")).toHaveCount(1);
});

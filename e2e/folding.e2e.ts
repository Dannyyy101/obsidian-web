import { activeEditor, expect, openFromExplorer, test } from "./fixtures";

test("Überschriften lassen sich einklappen, der Zustand bleibt nach dem Neuladen", async ({ vault: page }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  const editor = activeEditor(page);
  const heading = editor.locator(".cm-line.HyperMD-header-1");
  await heading.hover();
  await heading.locator(".cm-fold-indicator").click();
  await expect(editor.locator(".cm-foldPlaceholder")).toBeVisible();
  await expect(editor).not.toContainText("Meilenstein");

  await page.reload();
  await openFromExplorer(page, "Projekte/Plan.md");
  await expect(activeEditor(page).locator(".cm-foldPlaceholder")).toBeVisible();
  await activeEditor(page).locator(".cm-foldPlaceholder").click();
  await expect(activeEditor(page)).toContainText("Meilenstein");
});

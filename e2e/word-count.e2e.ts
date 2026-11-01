import { activeEditor, expect, openFromExplorer, test } from "./fixtures";

test("Statusleiste zählt Wörter und Zeichen der Notiz und der Auswahl", async ({ vault: page }) => {
  const count = page.locator(".status-bar .plugin-word-count");
  await openFromExplorer(page, "Projekte/Plan.md");
  await expect(count).toHaveText("9 Wörter60 Zeichen");

  await activeEditor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("Neu");
  await expect(count).toHaveText("10 Wörter63 Zeichen");

  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(count).toHaveText("1 Wort3 Zeichen");
  await expect(count).toHaveClass(/mod-selection/);
});

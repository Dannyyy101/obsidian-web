import { activeEditor, activeView, expect, expectOpen, openFromExplorer, test } from "./fixtures";

test("Live Preview rendert Callouts, Links und Aufgaben", async ({ vault: page }) => {
  await openFromExplorer(page, "Willkommen.md");
  const editor = activeEditor(page);
  await expect(editor.locator('.callout[data-callout="note"]')).toBeVisible();
  await expect(editor.locator(".internal-link", { hasText: "den Umlauten" })).toBeVisible();
  await expect(editor.locator('input[type="checkbox"]')).toHaveCount(2);
});

test("ein Klick auf einen Wikilink öffnet das Ziel", async ({ vault: page }) => {
  await openFromExplorer(page, "Willkommen.md");
  await activeEditor(page).locator(".internal-link", { hasText: "Plan" }).click();
  await expectOpen(page, "Projekte/Plan.md");
});

test("Lesemodus rendert die Notiz und schaltet zurück", async ({ vault: page }) => {
  await openFromExplorer(page, "Willkommen.md");
  await activeEditor(page).click();
  await page.keyboard.press("ControlOrMeta+E");
  const reading = activeView(page).locator(".markdown-reading-view");
  await expect(reading.locator("h1", { hasText: "Willkommen" })).toBeVisible();
  await expect(reading.locator('.callout[data-callout="note"] strong')).toHaveText("fettem");
  await expect(reading.locator("a.tag")).toHaveText("#start");

  await page.keyboard.press("ControlOrMeta+E");
  await expect(reading).toBeHidden();
  await expect(activeEditor(page)).toBeVisible();
});

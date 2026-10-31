import { activeEditor, activeView, expect, expectOpen, openFromExplorer, readVaultFile, test } from "./fixtures";

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

test("Enter setzt Listen fort, Tab rückt ein, Enter auf leerem Punkt beendet die Liste", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  await activeEditor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- [ ] eins");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("zwei");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ende");

  await expect
    .poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md"), { timeout: 10_000 })
    .toContain("\n- [ ] eins\n\t- [ ] zwei\nEnde");
});

test("Klammern schließen sich selbst, Formatierungszeichen umschließen die Auswahl", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  await activeEditor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("(siehe [[Plan");
  await page.keyboard.press("End");
  await page.keyboard.type(" Wort");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.type("**");

  await expect.poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md"), { timeout: 10_000 }).toContain("(siehe [[Plan]]) **Wort**");
});

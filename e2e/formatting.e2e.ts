import { activeEditor, expect, openFromExplorer, readVaultFile, test } from "./fixtures";

test("Cmd/Strg+B formatiert fett, das Kontextmenü bietet Formatierungen an", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  const editor = activeEditor(page);
  await editor.click();
  await editor.locator(".cm-line", { hasText: "Zurück zu" }).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("End");
  await page.keyboard.type(" eins zwei");
  await page.keyboard.press("ControlOrMeta+B");

  await editor.locator(".cm-line", { hasText: "Zurück zu" }).click({ button: "right", position: { x: 5, y: 5 } });
  await page.locator(".menu-item", { hasText: "Absatz" }).hover();
  await page.locator(".menu-item", { hasText: "Überschrift 2" }).click();
  await expect(page.locator(".menu")).toHaveCount(0);

  await expect
    .poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md"), { timeout: 10_000 })
    .toContain("## Zurück zu [[Willkommen]]. eins **zwei**");
});

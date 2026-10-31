import { readFileSync } from "node:fs";
import { activeEditor, expect, expectOpen, openVault, readFixtureVault, seedVault, test } from "./fixtures";

const ID = "omnisearch";
const PLUGIN_DIR = `public/bundled-plugins/${ID}`;

test("Omnisearch findet eine Notiz und springt an die Fundstelle", async ({ page, vaultName }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    // Den HTTP-Server für die lokale API startet Omnisearch nur auf dem Desktop (Node-Modul `http`).
    if (msg.type() === "error" && !msg.text().includes("Failed to load API server")) errors.push(msg.text());
  });
  await page.goto("/");
  await seedVault(page, vaultName, [
    ...readFixtureVault(),
    ...["manifest.json", "main.js", "styles.css"].map((file) => ({
      path: `.obsidian/plugins/${ID}/${file}`,
      content: readFileSync(`${PLUGIN_DIR}/${file}`, "utf8"),
    })),
    { path: ".obsidian/community-plugins.json", content: JSON.stringify([ID]) },
    { path: "Einkauf.md", content: "- Brot\n- Milch kaufen\n" },
  ]);
  await openVault(page, vaultName);
  await expect(page.locator('.side-dock-ribbon [aria-label="Omnisearch"]')).toBeVisible();

  // Über die Befehlspalette öffnen; Escape schließt den Dialog (Scope des Modals).
  await page.keyboard.press("ControlOrMeta+p");
  await page.keyboard.type("Omnisearch: Vault search");
  await page.keyboard.press("Enter");
  const modal = page.locator(".omnisearch-modal");
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  await page.locator('.side-dock-ribbon [aria-label="Omnisearch"]').click();
  // Omnisearch fokussiert das Suchfeld erst nach dem ersten Rendern.
  await expect(modal.locator("input")).toBeFocused();
  await page.keyboard.type("kaufen");
  const result = modal.locator("[data-result-id]").first();
  await expect(result).toContainText("Einkauf");
  await page.keyboard.press("Enter");

  await expectOpen(page, "Einkauf.md");
  await expect(modal).toHaveCount(0);
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected?.toLowerCase()).toBe("kaufen");
  await expect(activeEditor(page)).toContainText("Milch kaufen");

  expect(errors).toEqual([]);
});

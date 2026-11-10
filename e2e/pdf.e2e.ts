import type { Page } from "@playwright/test";
import { expect, openFromExplorer, openVault, readFixtureVault, seedVault, test } from "./fixtures";

// Die erste Zeile hält den Cursor beim Öffnen fern vom Link, sonst zeigt Live Preview dessen Quelle.
const NOTE = `# Verweise

Siehe [[Handbuch.pdf#page=2|Handbuch]].
`;

async function openPdfVault(page: Page, vaultName: string) {
  await page.goto("/");
  await seedVault(page, vaultName, [
    ...readFixtureVault(),
    { path: "Verweise.md", content: NOTE },
    { path: "Unterlagen/Handbuch.pdf", content: "%PDF-1.4" },
  ]);
  await openVault(page, vaultName);
}

const activeTab = (page: Page) => page.locator(".mod-root .workspace-tab-header.is-active");
const pdfFrame = (page: Page) => page.locator('.mod-root .workspace-leaf-content[data-type="pdf"]:visible iframe.pdf-container');

test("PDF aus dem Datei-Explorer öffnet sich in einem Tab und bleibt nach dem Neuladen offen", async ({ page, vaultName }) => {
  await openPdfVault(page, vaultName);
  await page.locator('.nav-folder-title[data-path="Unterlagen"]').click();
  await page.locator('.nav-file-title[data-path="Unterlagen/Handbuch.pdf"]').click();

  await expect(activeTab(page)).toHaveAttribute("aria-label", "Unterlagen/Handbuch.pdf");
  await expect(activeTab(page)).toHaveText("Handbuch");
  await expect(pdfFrame(page)).toHaveAttribute("src", /^blob:/);

  await page.reload();
  await expect(activeTab(page)).toHaveAttribute("aria-label", "Unterlagen/Handbuch.pdf");
  await expect(pdfFrame(page)).toHaveAttribute("src", /^blob:/);
});

test("Link auf eine PDF-Seite öffnet die PDF-Ansicht, danach zeigt der Tab wieder die Notiz", async ({ page, vaultName }) => {
  await openPdfVault(page, vaultName);
  await openFromExplorer(page, "Verweise.md");

  await page.locator(".mod-root .markdown-view:visible .internal-link", { hasText: "Handbuch" }).click();
  await expect(activeTab(page)).toHaveAttribute("aria-label", "Unterlagen/Handbuch.pdf");
  await expect(pdfFrame(page)).toHaveAttribute("src", /^blob:.*#page=2$/);

  // Dieselbe Notiz im selben Tab: Der Editor hat sie noch geladen, die PDF-Ansicht muss trotzdem weichen.
  await openFromExplorer(page, "Verweise.md");
  await expect(pdfFrame(page)).toHaveCount(0);
});

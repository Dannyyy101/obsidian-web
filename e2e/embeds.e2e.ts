import type { Locator, Page } from "@playwright/test";
import { activeEditor, activeView, expect, openFromExplorer, openVault, readFixtureVault, seedVault, test } from "./fixtures";

const SOURCE = `# Quelle

Einleitung der Quelle.

## Details

Text im Abschnitt Details.

## Anderes

Ein Absatz mit Block-ID. ^absatz

Letzter Absatz.
`;

// Die erste Zeile hält den Cursor beim Öffnen fern von den Embeds, sonst zeigt Live Preview ihre Quelle.
const EMBEDS = `# Einbettungen

![[Quelle]]

![[Quelle#Details]]

![[Quelle#^absatz]]

![[Klang.mp3]]

![[Film.mp4]]

![[Dokument.pdf]]
`;

/** Fixture-Vault plus eine Quellnotiz, eine Notiz mit Embeds und Mediendateien (Inhalt egal, es zählt die Endung). */
async function openEmbedVault(page: Page, vaultName: string) {
  await page.goto("/");
  await seedVault(page, vaultName, [
    ...readFixtureVault(),
    { path: "Quelle.md", content: SOURCE },
    { path: "Einbettungen.md", content: EMBEDS },
    { path: "Klang.mp3", content: "mp3" },
    { path: "Film.mp4", content: "mp4" },
    { path: "Dokument.pdf", content: "%PDF-1.4" },
  ]);
  await openVault(page, vaultName);
  await openFromExplorer(page, "Einbettungen.md");
}

/** Prüft alle Embeds unterhalb von `root`, egal ob Live Preview oder Lesemodus. */
async function expectEmbeds(root: Locator) {
  const embed = (src: string) => root.locator(`.internal-embed[src="${src}"]`);

  // Ganze Notiz.
  const note = embed("Quelle").locator(".markdown-embed-content");
  await expect(note.locator("h1")).toHaveText("Quelle");
  await expect(note).toContainText("Text im Abschnitt Details.");
  await expect(note).toContainText("Letzter Absatz.");

  // Abschnitt: nur bis zur nächsten Überschrift derselben Ebene.
  const section = embed("Quelle#Details").locator(".markdown-embed-content");
  await expect(section.locator("h2")).toHaveText("Details");
  await expect(section).toContainText("Text im Abschnitt Details.");
  await expect(section).not.toContainText("Ein Absatz mit Block-ID");

  // Block: nur der Absatz mit der Markierung, ohne die Markierung selbst.
  const block = embed("Quelle#^absatz").locator(".markdown-embed-content");
  await expect(block).toHaveText("Ein Absatz mit Block-ID.");

  await expect(embed("Klang.mp3").locator("audio")).toHaveAttribute("src", /.+/);
  await expect(embed("Film.mp4").locator("video")).toHaveAttribute("src", /.+/);
  await expect(embed("Dokument.pdf").locator("iframe")).toHaveAttribute("src", /.+/);
  await expect(root.locator(".internal-embed.is-unresolved")).toHaveCount(0);
}

test("Live Preview bettet Notizen, Abschnitte, Blöcke und Medien ein", async ({ page, vaultName }) => {
  await openEmbedVault(page, vaultName);
  await expectEmbeds(activeEditor(page));
});

test("Lesemodus bettet Notizen, Abschnitte, Blöcke und Medien ein", async ({ page, vaultName }) => {
  await openEmbedVault(page, vaultName);
  await activeEditor(page).locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+E");
  await expectEmbeds(activeView(page).locator(".markdown-reading-view"));
});

test("Klick auf den Link eines Notiz-Embeds öffnet die Notiz", async ({ page, vaultName }) => {
  await openEmbedVault(page, vaultName);
  await activeEditor(page).locator('.internal-embed[src="Quelle#Details"] .markdown-embed-link').click();
  await expect(page.locator(".mod-root .workspace-tab-header.is-active")).toHaveAttribute("aria-label", "Quelle.md");
});

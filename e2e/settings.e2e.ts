import type { Locator, Page } from "@playwright/test";
import { activeEditor, activeView, expect, openFromExplorer, readVaultFile, saveAndReadVaultFile, test } from "./fixtures";

/** Öffnet den Einstellungsdialog über die Ribbon und darin den Reiter `id`. */
async function openSettingTab(page: Page, id: string) {
  await page.locator('.side-dock-ribbon-action[aria-label="Einstellungen"]').click();
  const modal = page.locator(".modal.mod-settings");
  await modal.locator(`.vertical-tab-nav-item[data-id="${id}"]`).click();
  await expect(modal.locator(`.vertical-tab-nav-item[data-id="${id}"]`)).toHaveClass(/is-active/);
  return modal;
}

/** Zeile einer Einstellung im geöffneten Reiter, gefunden über ihren Namen. */
function setting(modal: Locator, name: string) {
  return modal.locator(".setting-item").filter({ has: modal.page().locator(".setting-item-name", { hasText: name }) });
}

/** Liest eine JSON-Datei aus dem Vault, `null`, solange sie fehlt. */
async function readJson(page: Page, vaultName: string, path: string): Promise<Record<string, unknown> | null> {
  const text = await readVaultFile(page, vaultName, path);
  return text === null ? null : JSON.parse(text);
}

/** Lädt die Seite neu und wartet, bis der Vault wieder offen ist. */
async function reload(page: Page) {
  await page.reload();
  await expect(page.locator(".nav-files-container")).toBeAttached();
}

test("Editor: lesbare Zeilenlänge und Inline-Titel wirken sofort und bleiben in app.json", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  const sourceView = activeView(page).locator(".markdown-source-view");
  await expect(sourceView).toHaveClass(/is-readable-line-width/);

  const modal = await openSettingTab(page, "editor");
  await setting(modal, "Lesbare Zeilenlänge").locator(".checkbox-container").click();
  await setting(modal, "Inline-Titel anzeigen").locator(".checkbox-container").click();
  await expect(sourceView).not.toHaveClass(/is-readable-line-width/);
  await expect(activeEditor(page).locator(".inline-title")).toHaveCount(0);

  // Bestehende Schlüssel aus app.json bleiben erhalten.
  await expect
    .poll(() => readJson(page, vaultName, ".obsidian/app.json"))
    .toEqual({ alwaysUpdateLinks: true, readableLineLength: false, showInlineTitle: false });

  await reload(page);
  await expect(page.locator(".mod-root .workspace-tab-header.is-active")).toHaveAttribute("aria-label", "Projekte/Plan.md");
  await expect(activeEditor(page)).toContainText("Plan");
  await expect(activeView(page).locator(".markdown-source-view")).not.toHaveClass(/is-readable-line-width/);
  await expect(activeEditor(page).locator(".inline-title")).toHaveCount(0);
  const reopened = await openSettingTab(page, "editor");
  await expect(setting(reopened, "Lesbare Zeilenlänge").locator(".checkbox-container")).not.toHaveClass(/is-enabled/);
  await expect(setting(reopened, "Live Preview").locator(".checkbox-container")).toHaveClass(/is-enabled/);
});

test("Dateien & Links: Anhangsordner und Linkformat gelten für neue Anhänge und bleiben in app.json", async ({ vault: page, vaultName }) => {
  const modal = await openSettingTab(page, "file");
  const folder = setting(modal, "Speicherort für neue Anhänge").locator("input");
  await expect(folder).toHaveValue("/");
  await folder.fill("Anhänge");
  await folder.blur();
  await setting(modal, "Wikilinks verwenden").locator(".checkbox-container").click();
  await expect
    .poll(() => readJson(page, vaultName, ".obsidian/app.json"))
    .toEqual({ alwaysUpdateLinks: true, attachmentFolderPath: "Anhänge", useMarkdownLinks: true });
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  // Ein abgelegter Anhang landet sofort im neuen Ordner und wird als Markdown-Link eingebettet.
  await openFromExplorer(page, "Projekte/Plan.md");
  await activeEditor(page).evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(["hallo"], "Notizen.txt", { type: "text/plain" }));
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true, clientX: rect.left + 5, clientY: rect.bottom - 5 }));
  });
  await expect.poll(() => readVaultFile(page, vaultName, "Anhänge/Notizen.txt")).toBe("hallo");
  await expect.poll(() => saveAndReadVaultFile(page, vaultName, "Projekte/Plan.md")).toMatch(/!\[[^\]]*\]\([^)]*Notizen\.txt>?\)/);

  await reload(page);
  const reopened = await openSettingTab(page, "file");
  await expect(setting(reopened, "Speicherort für neue Anhänge").locator("input")).toHaveValue("Anhänge");
  await expect(setting(reopened, "Wikilinks verwenden").locator(".checkbox-container")).not.toHaveClass(/is-enabled/);
});

test("Darstellung: Farbschema und Schriftgröße wirken sofort und bleiben in appearance.json", async ({ vault: page, vaultName }) => {
  const body = page.locator("body");
  const modal = await openSettingTab(page, "appearance");
  await setting(modal, "Farbschema").locator("select").selectOption("obsidian");
  await expect(body).toHaveClass(/theme-dark/);
  await setting(modal, "Farbschema").locator("select").selectOption("moonstone");
  await expect(body).toHaveClass(/theme-light/);
  await setting(modal, "Schriftgröße").locator("input[type=range]").fill("20");
  await expect.poll(() => body.evaluate((el) => el.style.getPropertyValue("--font-text-size"))).toBe("20px");
  await expect.poll(() => readJson(page, vaultName, ".obsidian/appearance.json")).toEqual({ theme: "moonstone", baseFontSize: 20 });

  await reload(page);
  await expect(body).toHaveClass(/theme-light/);
  await expect.poll(() => body.evaluate((el) => el.style.getPropertyValue("--font-text-size"))).toBe("20px");
  const reopened = await openSettingTab(page, "appearance");
  await expect(setting(reopened, "Farbschema").locator("select")).toHaveValue("moonstone");
  await expect(setting(reopened, "Schriftgröße").locator("input[type=range]")).toHaveValue("20");
});

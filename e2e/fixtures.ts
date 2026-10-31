import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

const FIXTURE_DIR = join(import.meta.dirname, "fixtures/vault");

/** Alle Dateien des Fixture-Vaults als vault-relative Pfade (in NFC, wie sie im Repository stehen). */
export function readFixtureVault(): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push({ path: relative(FIXTURE_DIR, full).split("\\").join("/").normalize("NFC"), content: readFileSync(full, "utf8") });
    }
  };
  visit(FIXTURE_DIR);
  return files;
}

/** Schreibt Dateien direkt ins OPFS unter `vaults/<name>/`, so wie der `OpfsBackend` sie ablegt. */
export async function seedVault(page: Page, name: string, files: { path: string; content: string }[]) {
  await page.evaluate(
    async ({ name, files }) => {
      const opfs = await navigator.storage.getDirectory();
      const vaults = await opfs.getDirectoryHandle("vaults", { create: true });
      const root = await vaults.getDirectoryHandle(name, { create: true });
      for (const { path, content } of files) {
        const parts = path.split("/");
        let dir = root;
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
        const handle = await dir.getFileHandle(parts.at(-1)!, { create: true });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      }
    },
    { name, files },
  );
}

/** Löscht den Vault `name` aus dem OPFS. */
async function removeVault(page: Page, name: string) {
  await page.evaluate(async (name) => {
    const vaults = await (await navigator.storage.getDirectory()).getDirectoryHandle("vaults", { create: true });
    await vaults.removeEntry(name, { recursive: true }).catch(() => {});
  }, name);
}

/** Liest eine Datei direkt aus dem OPFS, um zu prüfen, was wirklich gespeichert wurde. */
export async function readVaultFile(page: Page, name: string, path: string): Promise<string | null> {
  return page.evaluate(
    async ({ name, path }) => {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("vaults");
        dir = await dir.getDirectoryHandle(name);
        const parts = path.split("/");
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
        return await (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).text();
      } catch {
        return null;
      }
    },
    { name, path },
  );
}

/** Öffnet den Vault und wartet, bis der Datei-Explorer steht. */
export async function openVault(page: Page, name: string) {
  await page.goto(`/?vault=${encodeURIComponent(name)}`);
  await expect(page.locator(".nav-files-container")).toBeVisible();
}

export const test = base.extend<{ vaultName: string; vault: Page }>({
  /**
   * WebKit erlaubt OPFS nur mit dauerhaftem Profil, Playwright-Kontexte sind sonst flüchtig.
   * Jeder Test bekommt ein eigenes Profil im Ausgabeordner.
   */
  context: async ({ browserName, context, playwright, baseURL, viewport }, use, testInfo) => {
    if (browserName !== "webkit") return use(context);
    const persistent = await playwright.webkit.launchPersistentContext(testInfo.outputPath("profile"), { baseURL, viewport });
    await use(persistent);
    await persistent.close();
  },

  /**
   * Eigener Vault-Name je Test. WebKit teilt das OPFS zwischen allen Profilen, deshalb trennt erst
   * der Name parallel laufende Tests. Der Vault wird danach gelöscht.
   */
  vaultName: async ({ page }, use, testInfo) => {
    const name = `E2E-${testInfo.testId}-${testInfo.retry}`;
    await use(name);
    if (!page.isClosed()) await removeVault(page, name);
  },

  /** Seite mit geöffnetem Fixture-Vault. */
  vault: async ({ page, vaultName }, use) => {
    await page.goto("/");
    await seedVault(page, vaultName, readFixtureVault());
    await openVault(page, vaultName);
    await use(page);
  },
});

export { expect };

/** Datei über den Datei-Explorer öffnen. */
export async function openFromExplorer(page: Page, path: string) {
  const folder = path.split("/").slice(0, -1).join("/");
  const collapsed = page.locator(`.nav-folder.is-collapsed > .nav-folder-title[data-path="${folder}"]`);
  if (folder && (await collapsed.count())) await collapsed.click();
  await page.locator(`.nav-file-title[data-path="${path}"]`).click();
  await expectOpen(page, path);
}

/** Wartet, bis der aktive Tab `path` zeigt und der Editor die Datei geladen hat. */
export async function expectOpen(page: Page, path: string) {
  await expect(page.locator(".mod-root .workspace-tab-header.is-active")).toHaveAttribute("aria-label", path);
  const basename = path.split("/").at(-1)!.replace(/\.md$/, "");
  await expect(activeView(page).locator(".cm-content .inline-title")).toHaveText(basename);
}

/** Aktiver Editor-Tab; die Editoren inaktiver Tabs sind ausgeblendet. */
export function activeView(page: Page) {
  return page.locator(".mod-root .markdown-view:visible");
}

/** Bearbeitbarer Text des aktiven Editors. */
export function activeEditor(page: Page) {
  return activeView(page).locator(".cm-content");
}

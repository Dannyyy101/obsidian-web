import { activeEditor, expect, openFromExplorer, readVaultFile, test } from "./fixtures";

test("eingefügtes Bild landet als Anhang im Vault und wird eingebettet", async ({ vault: page, vaultName, browserName }) => {
  test.skip(browserName === "firefox", "Firefox ignoriert clipboardData in synthetischen Paste-Events");
  await openFromExplorer(page, "Projekte/Plan.md");
  await activeEditor(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await activeEditor(page).evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "image.svg", { type: "image/svg+xml" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.nav-file-title[data-path^="Pasted image "]')).toBeVisible();
  await expect
    .poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md"), { timeout: 10_000 })
    .toMatch(/!\[\[Pasted image \d{14}\.svg\]\]$/);
});

test("abgelegte Datei behält ihren Namen", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  await activeEditor(page).evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File(["hallo"], "Notizen.txt", { type: "text/plain" }));
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true, clientX: rect.left + 5, clientY: rect.bottom - 5 }));
  });
  await expect.poll(() => readVaultFile(page, vaultName, "Notizen.txt")).toBe("hallo");
  await expect.poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md"), { timeout: 10_000 }).toContain("![[Notizen.txt]]");
});

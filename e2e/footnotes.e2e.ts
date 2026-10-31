import { activeEditor, activeView, expect, openFromExplorer, test } from "./fixtures";

test("Fußnoten werden in Live Preview und Lesemodus gerendert", async ({ vault: page }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  const editor = activeEditor(page);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\nMit Beleg[^q] und ^[nebenbei].\n\n[^q]: Die Quelle\n\nEnde");
  await expect(editor.locator("sup.footnote-ref", { hasText: "[q]" })).toHaveAttribute("title", "Die Quelle");

  await page.keyboard.press("ControlOrMeta+E");
  const reading = activeView(page).locator(".markdown-reading-view");
  await expect(reading.locator("p sup.footnote-ref")).toHaveText(["1", "2"]);
  await expect(reading.locator("section.footnotes li")).toHaveText(["Die Quelle ↩︎", "nebenbei ↩︎"]);
  await reading.locator("p sup.footnote-ref a").first().click();
  await expect(page).not.toHaveURL(/#fn-/);
});

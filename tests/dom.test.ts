// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installDomExtensions } from "../src/ui/dom";

describe("DOM extensions", () => {
  beforeAll(() => installDomExtensions());
  afterEach(() => vi.unstubAllGlobals());

  it("does not need the global document when a parent is given", () => {
    // A late sidebar refresh after the test environment is torn down must not crash.
    const parent = document.createElement("div");
    vi.stubGlobal("document", undefined);
    parent.createDiv({ cls: "pane-empty", text: "Indexing notes …" });
    expect(parent.querySelector(".pane-empty")?.textContent).toBe("Indexing notes …");
  });
});

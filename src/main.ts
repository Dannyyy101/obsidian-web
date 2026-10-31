import { App } from "./app/app";
import { followSystemTheme, loadAppearance } from "./app/appearance";
import { Vault } from "./core/vault";
import { createWorkerParser } from "./core/worker/worker-parser";
import { IdbMetadataStore } from "./storage/idb-metadata-store";
import { IdbTimesStore } from "./storage/idb-times-store";
import { IndexedAdapter } from "./storage/indexed-adapter";
import { OpfsBackend } from "./storage/opfs-backend";
import { installDomExtensions } from "./ui/dom";
import { Notice } from "./ui/notice";
import { showVaultPicker } from "./ui/vault-picker";
import "./styles/app.css";

async function openVault(name: string, root: HTMLElement) {
  document.title = `${name} – obsidian-web`;
  // Ohne persistenten Speicher darf der Browser den Vault bei Platzmangel löschen. Nicht abwarten:
  // Firefox fragt per Dialog nach und löst das Promise erst nach der Antwort auf.
  void navigator.storage.persist?.().catch(() => false);

  const adapter = new IndexedAdapter(name, await OpfsBackend.open(name), new IdbTimesStore(name));
  const vault = new Vault(adapter);
  await vault.load();
  await loadAppearance(vault);

  const app = new App(vault, root, {
    metadataParser: createWorkerParser(),
    metadataStore: new IdbMetadataStore(name),
  });

  await app.plugins.installBundled();
  await app.plugins.loadEnabled();
  // Wie Obsidian: erst das Layout (Tabs) wiederherstellen, dann „layout ready“ melden.
  await app.workspace.restoreLayout();
  app.workspace.setLayoutReady();
  // Index im Hintergrund aufbauen; Backlinks und Suche zeigen bis dahin „Indexiere …“.
  void app.metadataCache.initialize();

  const uri = new URLSearchParams(location.search).get("uri");
  if (uri && !(await app.handleObsidianUri(uri))) new Notice("Die übergebene Obsidian-URI konnte nicht ausgeführt werden.");
}

/**
 * Sichtbare Höhe als `--viewport-height`: Safari auf iOS verkleinert beim Einblenden der
 * Bildschirmtastatur nur den „visual viewport“, sonst läge der Editor teils hinter der Tastatur.
 */
function trackViewportHeight() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const update = () => {
    document.documentElement.style.setProperty("--viewport-height", `${viewport.height}px`);
    // iOS schiebt die Seite beim Fokussieren nach oben, obwohl sie nicht scrollbar ist.
    if (window.scrollY) window.scrollTo(0, 0);
  };
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  update();
}

async function main() {
  installDomExtensions();
  trackViewportHeight();
  followSystemTheme();
  const root = document.getElementById("app")!;
  const params = new URLSearchParams(location.search);
  const vaultName = params.get("vault");
  if (vaultName) return openVault(vaultName, root);

  showVaultPicker(root, await OpfsBackend.listVaults(), (name) => {
    params.set("vault", name);
    location.search = params.toString();
  });
}

main().catch((err) => {
  console.error(err);
  document.body.createDiv({ cls: "fatal-error", text: `obsidian-web konnte nicht starten: ${err}` });
});

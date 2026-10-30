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
  // Ohne persistenten Speicher darf der Browser den Vault bei Platzmangel löschen.
  await navigator.storage.persist?.();

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

async function main() {
  installDomExtensions();
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

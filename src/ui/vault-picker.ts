/**
 * Startbildschirm: vorhandenen Vault öffnen oder neuen anlegen. Der Name ist wichtig – remotely-save
 * leitet daraus u. a. den Ordner auf dem Server ab und muss zum Desktop-Vault passen.
 */
export function showVaultPicker(parent: HTMLElement, vaults: string[], onPick: (name: string) => void) {
  const el = parent.createDiv("vault-picker");
  const card = el.createDiv("vault-picker-card");
  card.createEl("h1", { text: "obsidian-web" });

  if (vaults.length) {
    card.createEl("h2", { text: "Vault öffnen" });
    const list = card.createDiv("vault-list");
    for (const name of vaults) {
      list.createEl("button", { cls: "vault-list-item", text: name }).addEventListener("click", () => onPick(name));
    }
  }

  card.createEl("h2", { text: "Neuen Vault anlegen" });
  card.createEl("p", {
    cls: "setting-item-description",
    text: "Verwende denselben Namen wie der Vault in Obsidian Desktop. remotely-save nutzt den Namen standardmäßig als Ordner auf dem Server.",
  });
  const form = card.createEl("form", "vault-create");
  const input = form.createEl("input", { type: "text", placeholder: "Vault-Name" });
  form.createEl("button", { text: "Anlegen", cls: "mod-cta", type: "submit" });
  form.addEventListener("submit", (evt) => {
    evt.preventDefault();
    const name = input.value.trim();
    if (name && !/[\\/:]/.test(name)) onPick(name);
  });
  input.focus();
}

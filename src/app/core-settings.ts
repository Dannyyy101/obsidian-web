import { Setting } from "../ui/setting";
import type { SettingTab } from "../ui/settings-modal";
import type { App } from "./app";
import { getAppearance, setAppearance } from "./appearance";

/** Einstellungsreiter der App selbst (in Obsidian unter „Optionen“), Werte wie in `app.json`/`appearance.json`. */
abstract class CoreSettingTab implements SettingTab {
  containerEl = createDiv("vertical-tab-content");

  constructor(
    protected app: App,
    public id: string,
    public name: string,
  ) {}

  abstract display(): void;

  hide(): void {
    this.containerEl.empty();
  }

  /** Schalter für einen booleschen Wert aus `app.json`; `fallback` ist Obsidians Standardwert. */
  protected configToggle(name: string, desc: string, key: string, fallback: boolean, after?: () => void): Setting {
    const vault = this.app.vault;
    return new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) =>
        toggle.setValue((vault.getConfig(key) as boolean | undefined) ?? fallback).onChange(async (value) => {
          await vault.setConfig(key, value);
          after?.();
        }),
      );
  }
}

class EditorSettingTab extends CoreSettingTab {
  constructor(app: App) {
    super(app, "editor", "Editor");
  }

  display(): void {
    this.containerEl.empty();
    const applyAll = () => this.app.workspace.iterateEditors((editor) => editor.applySettings());
    this.configToggle(
      "Lesbare Zeilenlänge",
      "Begrenzt die Zeilenlänge. Ausgeschaltet nutzt die Notiz die ganze verfügbare Breite.",
      "readableLineLength",
      true,
      applyAll,
    );
    this.configToggle("Inline-Titel anzeigen", "Zeigt den Dateinamen als bearbeitbaren Titel über der Notiz.", "showInlineTitle", true, applyAll);
    this.configToggle("Live Preview", "Formatierung beim Schreiben anzeigen. Ausgeschaltet gilt der Quellmodus.", "livePreview", true, () =>
      this.app.workspace.iterateEditors((editor) => editor.reconfigureMode()),
    );
    this.configToggle("Überschriften einklappen", "Überschriften samt ihrem Abschnitt einklappen.", "foldHeading", true);
    this.configToggle("Listen einklappen", "Listenpunkte samt ihren Unterpunkten einklappen.", "foldIndent", true);
  }
}

class FilesLinksSettingTab extends CoreSettingTab {
  constructor(app: App) {
    super(app, "file", "Dateien & Links");
  }

  display(): void {
    this.containerEl.empty();
    this.configToggle(
      "Interne Links automatisch aktualisieren",
      "Passt Links in anderen Notizen an, wenn eine Datei umbenannt oder verschoben wird.",
      "alwaysUpdateLinks",
      true,
    );
  }
}

class AppearanceSettingTab extends CoreSettingTab {
  constructor(app: App) {
    super(app, "appearance", "Darstellung");
  }

  display(): void {
    this.containerEl.empty();
    const config = getAppearance();
    new Setting(this.containerEl)
      .setName("Farbschema")
      .setDesc("Hell, dunkel oder wie das System.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ system: "Wie System", moonstone: "Hell", obsidian: "Dunkel" })
          .setValue(config.theme === "moonstone" || config.theme === "obsidian" ? config.theme : "system")
          .onChange((value) => setAppearance("theme", value)),
      );

    new Setting(this.containerEl).setName("Schrift").setHeading();
    new Setting(this.containerEl)
      .setName("Schriftgröße")
      .setDesc("Schriftgröße des Notiztexts in Pixeln.")
      .addSlider((slider) =>
        slider
          .setLimits(10, 30, 1)
          .setValue(config.baseFontSize ?? 16)
          .setDynamicTooltip()
          .onChange((value) => setAppearance("baseFontSize", value)),
      );
    const fonts: [keyof typeof config, string, string][] = [
      ["textFontFamily", "Textschrift", "Schrift für Notizen im Lese- und Bearbeitungsmodus."],
      ["interfaceFontFamily", "Oberflächenschrift", "Schrift für Menüs, Seitenleisten und Dialoge."],
      ["monospaceFontFamily", "Monospace-Schrift", "Schrift für Code und Codeblöcke."],
    ];
    for (const [key, name, desc] of fonts) {
      new Setting(this.containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) => {
          text.setPlaceholder("Standard").setValue(typeof config[key] === "string" ? (config[key] as string) : "");
          text.inputEl.addEventListener("change", () => void setAppearance(key, text.getValue().trim() || undefined));
        });
    }
  }
}

export function coreSettingTabs(app: App): SettingTab[] {
  return [new EditorSettingTab(app), new FilesLinksSettingTab(app), new AppearanceSettingTab(app)];
}

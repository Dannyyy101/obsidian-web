import type { ReferenceCache } from "../markdown/metadata";
import { type MetadataCache, parseLinktext } from "./metadata-cache";
import { type TAbstractFile, TFile, TFolder, type Vault } from "./vault";

/**
 * Entspricht Obsidians `FileManager`. Beim Umbenennen und Verschieben werden Links in anderen
 * Notizen angepasst – wie Obsidians Einstellung „Interne Links immer aktualisieren“
 * (`alwaysUpdateLinks`, hier standardmäßig an).
 */
export class FileManager {
  /** Wird vor dem Umbenennen aufgerufen, z. B. um ungespeicherte Editor-Änderungen zu schreiben. */
  beforeRename: () => Promise<void> = async () => {};

  constructor(
    private vault: Vault,
    private metadataCache: MetadataCache,
  ) {}

  async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
    const updateLinks = this.vault.getConfig("alwaysUpdateLinks") !== false;
    if (!updateLinks) return this.vault.rename(file, newPath);

    await this.beforeRename();
    await this.metadataCache.whenIdle();
    // Verweise auf alle betroffenen Dateien merken, solange die alten Pfade noch gelten.
    const moved = file instanceof TFolder ? descendantFiles(file) : file instanceof TFile ? [file] : [];
    const refsBySource = new Map<string, { target: TFile; ref: ReferenceCache }[]>();
    for (const target of moved) {
      for (const [source, refs] of this.metadataCache.getBacklinksForFile(target)) {
        const list = refsBySource.get(source) ?? [];
        list.push(...refs.map((ref) => ({ target, ref })));
        refsBySource.set(source, list);
      }
    }
    const sources = new Map([...refsBySource.keys()].map((p) => [p, this.vault.getFileByPath(p)]));

    await this.vault.rename(file, newPath);

    // Quellen über ihr TFile ansprechen: Sie können selbst mitverschoben worden sein.
    for (const [oldSource, entries] of refsBySource) {
      const source = sources.get(oldSource);
      if (!source || !entries.length) continue;
      await this.vault.process(source, (text) => this.rewriteLinks(text, source.path, entries));
    }
  }

  /** Ersetzt von hinten nach vorn, damit Offsets gültig bleiben; geänderter Text bleibt unangetastet. */
  private rewriteLinks(text: string, sourcePath: string, entries: { target: TFile; ref: ReferenceCache }[]): string {
    const sorted = [...entries].sort((a, b) => b.ref.position.start.offset - a.ref.position.start.offset);
    let result = text;
    for (const { target, ref } of sorted) {
      const { start, end } = ref.position;
      if (result.slice(start.offset, end.offset) !== ref.original) continue;
      result = result.slice(0, start.offset) + this.generateLink(ref, target, sourcePath) + result.slice(end.offset);
    }
    return result;
  }

  private generateLink(ref: ReferenceCache, target: TFile, sourcePath: string): string {
    const { subpath } = parseLinktext(ref.link);
    const embed = ref.original.startsWith("!");
    if (/^!?\[\[/.test(ref.original)) {
      const linktext = this.metadataCache.fileToLinktext(target, sourcePath);
      const alias = ref.original.includes("|") && ref.displayText !== undefined ? `|${ref.displayText}` : "";
      return `${embed ? "!" : ""}[[${linktext}${subpath}${alias}]]`;
    }
    // Markdown-Link: Pfad mit Endung, Leerzeichen kodiert (wie Obsidian).
    const linktext = this.metadataCache.fileToLinktext(target, sourcePath, false);
    return `${embed ? "!" : ""}[${ref.displayText ?? ""}](${encodeURI(linktext)}${subpath})`;
  }

  /** Obsidians `generateMarkdownLink` (Wikilink, kürzester Pfad). */
  generateMarkdownLink(file: TFile, sourcePath: string, subpath = "", alias = ""): string {
    const linktext = this.metadataCache.fileToLinktext(file, sourcePath);
    return `${file.extension === "md" ? "" : "!"}[[${linktext}${subpath}${alias ? `|${alias}` : ""}]]`;
  }

  async trashFile(file: TAbstractFile): Promise<void> {
    await this.vault.trash(file, true);
  }
}

function descendantFiles(folder: TFolder): TFile[] {
  return folder.children.flatMap((c) => (c instanceof TFolder ? descendantFiles(c) : c instanceof TFile ? [c] : []));
}

import { type CachedMetadata, computeMetadata, getAllTags, type ReferenceCache } from "../markdown/metadata";
import { Events } from "../shared/events";
import { dirname, join, unicodeKey } from "../shared/path";
import { type TAbstractFile, TFile, type Vault } from "./vault";

/** Entspricht Obsidians `parseLinktext`: `Notiz#Abschnitt` → { path, subpath }. */
export function parseLinktext(linktext: string): { path: string; subpath: string } {
  const i = linktext.indexOf("#");
  return i < 0 ? { path: linktext, subpath: "" } : { path: linktext.slice(0, i), subpath: linktext.slice(i) };
}

/** Parst Notizen zu Metadaten – im Browser in einem Worker, in Tests direkt. */
export type MetadataParser = (text: string) => Promise<CachedMetadata>;

export interface StoredMetadata {
  mtime: number;
  size: number;
  meta: CachedMetadata;
}

/** Persistenter Cache, damit nach einem Neustart nur geänderte Dateien neu geparst werden. */
export interface MetadataStore {
  load(): Promise<Map<string, StoredMetadata>>;
  set(path: string, entry: StoredMetadata): Promise<void>;
  delete(paths: string[]): Promise<void>;
}

export const inlineParser: MetadataParser = async (text) => computeMetadata(text);

export class MemoryMetadataStore implements MetadataStore {
  entries = new Map<string, StoredMetadata>();
  async load() {
    return new Map(this.entries);
  }
  async set(path: string, entry: StoredMetadata) {
    this.entries.set(path, entry);
  }
  async delete(paths: string[]) {
    for (const p of paths) this.entries.delete(p);
  }
}

const PARSE_CONCURRENCY = 8;

/**
 * Entspricht Obsidians `MetadataCache`: Metadaten aller Markdown-Dateien (Links, Embeds, Tags,
 * Überschriften, Blöcke, Frontmatter) und die daraus aufgelösten Links.
 *
 * Events wie in Obsidian: `changed` (file, data, cache) nach dem Neu-Parsen einer Datei,
 * `deleted` (file, prevCache), `resolve` (file) und `resolved` nach dem ersten vollständigen Lauf.
 */
export class MetadataCache extends Events {
  /** Quelle → Ziel → Anzahl, nur aufgelöste Links. */
  resolvedLinks: Record<string, Record<string, number>> = {};
  /** Quelle → Linktext → Anzahl, nur nicht aufgelöste Links. */
  unresolvedLinks: Record<string, Record<string, number>> = {};
  /** Erster vollständiger Indexlauf abgeschlossen. */
  initialized = false;

  private cache = new Map<string, StoredMetadata>();
  /** Kleingeschriebener Dateiname (NFC) → Dateien, für schnelle Linkauflösung. */
  private nameIndex: Map<string, TFile[]> | null = null;
  private queue = new Map<string, Promise<void>>();

  constructor(
    private vault: Vault,
    private parser: MetadataParser = inlineParser,
    private store: MetadataStore = new MemoryMetadataStore(),
  ) {
    super();
    vault.on("create", (file: TAbstractFile) => {
      this.nameIndex = null;
      if (this.initialized && isMarkdown(file)) void this.reindex(file).then(() => this.resolveAll());
      else if (this.initialized) this.resolveAll(); // neues Ziel kann bisher offene Links auflösen
    });
    vault.on("modify", (file: TAbstractFile) => {
      if (this.initialized && isMarkdown(file)) void this.reindex(file).then(() => this.resolveFile(file));
    });
    vault.on("delete", (file: TAbstractFile) => {
      this.nameIndex = null;
      const prev = this.cache.get(file.path);
      this.cache.delete(file.path);
      delete this.resolvedLinks[file.path];
      delete this.unresolvedLinks[file.path];
      void this.store.delete([file.path]);
      if (prev && file instanceof TFile) this.trigger("deleted", file, prev.meta);
      if (this.initialized) this.resolveAll();
    });
    vault.on("rename", (file: TAbstractFile, oldPath: string) => {
      this.nameIndex = null;
      const entry = this.cache.get(oldPath);
      if (entry) {
        this.cache.delete(oldPath);
        this.cache.set(file.path, entry);
        void this.store.delete([oldPath]).then(() => this.store.set(file.path, entry));
      }
      if (this.initialized) this.resolveAll();
    });
  }

  /** Baut den Index auf (aus dem persistenten Cache, wo mtime und Größe noch stimmen). */
  async initialize(): Promise<void> {
    const stored = await this.store.load();
    const files = this.vault.getMarkdownFiles();
    const todo: TFile[] = [];
    for (const file of files) {
      const entry = stored.get(file.path);
      if (entry && entry.mtime === file.stat.mtime && entry.size === file.stat.size) this.cache.set(file.path, entry);
      else todo.push(file);
    }
    const existing = new Set(files.map((f) => f.path));
    await this.store.delete([...stored.keys()].filter((p) => !existing.has(p)));

    for (let i = 0; i < todo.length; i += PARSE_CONCURRENCY) {
      await Promise.all(todo.slice(i, i + PARSE_CONCURRENCY).map((f) => this.reindex(f, false)));
    }
    this.initialized = true;
    this.resolveAll();
    this.trigger("resolved");
  }

  /** Wartet, bis alle laufenden Neu-Indizierungen fertig sind. */
  async whenIdle(): Promise<void> {
    while (this.queue.size) await Promise.all(this.queue.values());
  }

  /** Datei neu parsen; pro Pfad nacheinander, damit sich alte und neue Ergebnisse nicht überholen. */
  private reindex(file: TFile, notify = true): Promise<void> {
    const previous = this.queue.get(file.path) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (this.vault.getFileByPath(file.path) !== file) return;
      try {
        const text = await this.vault.cachedRead(file);
        const meta = await this.parser(text);
        const entry = { mtime: file.stat.mtime, size: file.stat.size, meta };
        this.cache.set(file.path, entry);
        await this.store.set(file.path, entry);
        if (notify) this.trigger("changed", file, text, meta);
      } catch (err) {
        console.error(`Metadaten für ${file.path} konnten nicht erstellt werden`, err);
      }
    });
    const tracked = next.finally(() => {
      if (this.queue.get(file.path) === tracked) this.queue.delete(file.path);
    });
    this.queue.set(file.path, tracked);
    return tracked;
  }

  getFileCache(file: TFile): CachedMetadata | null {
    return this.cache.get(file.path)?.meta ?? null;
  }

  getCache(path: string): CachedMetadata | null {
    return this.cache.get(path)?.meta ?? null;
  }

  /**
   * Ob `path` unter Obsidians „Ausgeschlossene Dateien“ fällt (`userIgnoreFilters` in `app.json`):
   * Pfadanfänge wie `Archiv/` oder reguläre Ausdrücke in `/…/`.
   */
  isUserIgnored(path: string): boolean {
    const filters = this.vault.getConfig("userIgnoreFilters");
    if (!Array.isArray(filters)) return false;
    return filters.some((filter) => {
      if (typeof filter !== "string" || !filter) return false;
      const regex = /^\/(.+)\/$/.exec(filter);
      if (!regex) return path.startsWith(filter);
      try {
        return new RegExp(regex[1]).test(path);
      } catch {
        return false;
      }
    });
  }

  /** Alle Links einer Datei, inkl. Embeds und Frontmatter-Links. */
  private references(path: string): { link: string }[] {
    const meta = this.getCache(path);
    if (!meta) return [];
    return [...(meta.links ?? []), ...(meta.embeds ?? []), ...(meta.frontmatterLinks ?? [])];
  }

  private resolveFile(file: TFile) {
    const resolved: Record<string, number> = {};
    const unresolved: Record<string, number> = {};
    for (const ref of this.references(file.path)) {
      const { path } = parseLinktext(ref.link);
      if (!path.trim()) continue; // Link auf die eigene Datei (`[[#Abschnitt]]`)
      const dest = this.getFirstLinkpathDest(path, file.path);
      if (dest) resolved[dest.path] = (resolved[dest.path] ?? 0) + 1;
      else unresolved[path] = (unresolved[path] ?? 0) + 1;
    }
    this.resolvedLinks[file.path] = resolved;
    this.unresolvedLinks[file.path] = unresolved;
    this.trigger("resolve", file);
  }

  private resolveAll() {
    this.resolvedLinks = {};
    this.unresolvedLinks = {};
    for (const file of this.vault.getMarkdownFiles()) this.resolveFile(file);
  }

  /**
   * Alle Tags im Vault mit Anzahl (`#tag` → n), wie Obsidians `getTags`. Groß-/Kleinschreibung
   * wird zusammengefasst; es gilt die zuerst gefundene Schreibweise.
   */
  getTags(): Record<string, number> {
    const counts = new Map<string, { tag: string; count: number }>();
    for (const { meta } of this.cache.values()) {
      for (const tag of getAllTags(meta)) {
        const key = tag.normalize("NFC").toLowerCase();
        const entry = counts.get(key);
        if (entry) entry.count++;
        else counts.set(key, { tag, count: 1 });
      }
    }
    return Object.fromEntries([...counts.values()].map(({ tag, count }) => [tag, count]));
  }

  /** Backlinks: Quelle → Verweise in dieser Quelle, die auf `file` zeigen. */
  getBacklinksForFile(file: TFile): Map<string, ReferenceCache[]> {
    const result = new Map<string, ReferenceCache[]>();
    for (const [source, targets] of Object.entries(this.resolvedLinks)) {
      if (!targets[file.path]) continue;
      const meta = this.getCache(source);
      const refs = [...(meta?.links ?? []), ...(meta?.embeds ?? [])].filter((ref) => {
        const { path } = parseLinktext(ref.link);
        return path.trim() && this.getFirstLinkpathDest(path, source) === file;
      });
      if (refs.length || meta?.frontmatterLinks?.length) result.set(source, refs);
    }
    return result;
  }

  private getNameIndex(): Map<string, TFile[]> {
    if (this.nameIndex) return this.nameIndex;
    const index = new Map<string, TFile[]>();
    for (const file of this.vault.getFiles()) {
      const key = unicodeKey(file.name.toLowerCase());
      const list = index.get(key);
      if (list) list.push(file);
      else index.set(key, [file]);
    }
    return (this.nameIndex = index);
  }

  /**
   * Wie Obsidian: Pfade mit „/“ zuerst relativ zum Vault, dann zur Quelldatei; sonst nach Dateiname,
   * bei mehreren Treffern der im selben Ordner, danach der mit dem kürzesten Pfad.
   */
  getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
    const target = parseLinktext(linkpath).path.trim();
    if (!target) return this.vault.getFileByPath(sourcePath);
    const hasExt = /\.[^/.]+$/.test(target);
    const candidates = hasExt ? [target, `${target}.md`] : [`${target}.md`, target];

    if (target.includes("/")) {
      for (const c of candidates) {
        const file = this.vault.getFileByPath(c) ?? this.vault.getFileByPath(join(dirname(sourcePath), c));
        if (file) return file;
      }
    }

    const suffixes = candidates.map((c) => unicodeKey(`/${c}`.toLowerCase()));
    const index = this.getNameIndex();
    const matches = candidates
      .flatMap((c) => index.get(unicodeKey(c.split("/").pop()!.toLowerCase())) ?? [])
      .filter((f) => suffixes.some((s) => unicodeKey(`/${f.path}`.toLowerCase()).endsWith(s)));
    if (!matches.length) return null;
    const sourceDir = dirname(sourcePath);
    return (
      matches.find((f) => dirname(f.path) === sourceDir) ??
      [...matches].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))[0]
    );
  }

  /** Kürzester eindeutiger Linktext (Obsidians Standard „Kürzester Pfad“). */
  fileToLinktext(file: TFile, sourcePath: string, omitMdExtension = true): string {
    const strip = omitMdExtension && file.extension === "md";
    const name = strip ? file.basename : file.name;
    if (this.getFirstLinkpathDest(name, sourcePath) === file) return name;
    return strip ? file.path.slice(0, -3) : file.path;
  }
}

function isMarkdown(file: TAbstractFile): file is TFile {
  return file instanceof TFile && file.extension === "md";
}

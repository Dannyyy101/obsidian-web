import { ancestors, basename, dirname, join, cleanPath, unicodeKey } from "../shared/path";
import type {
  AdapterChange,
  ChangeListener,
  DataAdapter,
  DataWriteOptions,
  ListedFiles,
  Stat,
} from "./data-adapter";

/** Minimale Speicher-Primitive, die ein konkretes Backend (OPFS, Memory …) liefern muss. */
export interface StorageBackend {
  walk(): Promise<{ path: string; kind: Stat["type"]; size: number; lastModified: number }[]>;
  readFile(path: string): Promise<ArrayBuffer>;
  /** Der Elternordner existiert bereits. */
  writeFile(path: string, data: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** Löscht Datei oder Ordner (rekursiv). */
  remove(path: string): Promise<void>;
}

export interface FileTimes {
  mtime: number;
  ctime: number;
}

/**
 * Persistiert mtime/ctime pro Pfad. Browser-Speicher lassen kein Setzen der mtime zu, der Sync
 * (remotely-save) vergleicht aber mtimes – ohne diese Tabelle sähe jede heruntergeladene Datei
 * sofort wieder verändert aus.
 */
export interface TimesStore {
  load(): Promise<Map<string, FileTimes>>;
  set(path: string, times: FileTimes): Promise<void>;
  delete(paths: string[]): Promise<void>;
}

const TRASH_DIR = ".trash";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * DataAdapter über einem StorageBackend. Weil alle Schreibzugriffe hier durchlaufen, hält der
 * Adapter einen vollständigen Index (Pfad → Stat) im Speicher; stat/list/exists brauchen dadurch
 * keinen Zugriff auf das Backend.
 *
 * Pfade behalten exakt die Schreibweise, mit der sie geschrieben wurden (NFC oder NFD), werden aber
 * unabhängig von der Unicode-Form gefunden. Das Backend darf Namen in anderer Form ablegen –
 * Safaris OPFS speichert z. B. NFD –, beim Start stellt `scan` die ursprüngliche Schreibweise aus
 * dem TimesStore wieder her.
 */
export class IndexedAdapter implements DataAdapter {
  private index = new Map<string, Stat>();
  /** unicodeKey(pfad) → Schlüssel im Index */
  private unicodeIndex = new Map<string, string>();
  private listeners = new Set<ChangeListener>();

  constructor(
    private name: string,
    private backend: StorageBackend,
    private times: TimesStore,
  ) {}

  getName(): string {
    return this.name;
  }

  async scan(): Promise<Map<string, Stat>> {
    const [entries, times] = await Promise.all([this.backend.walk(), this.times.load()]);
    // Bekannte Schreibweisen aus dem TimesStore, inkl. aller Elternordner der gespeicherten Pfade.
    const spelling = new Map<string, string>();
    for (const key of times.keys()) {
      for (const p of [...ancestors(key), key]) if (!spelling.has(unicodeKey(p))) spelling.set(unicodeKey(p), p);
    }
    for (const key of times.keys()) spelling.set(unicodeKey(key), key);

    this.index.clear();
    this.unicodeIndex.clear();
    for (const entry of entries) {
      const path = times.has(entry.path) ? entry.path : (spelling.get(unicodeKey(entry.path)) ?? unicodeKey(entry.path));
      const t = times.get(path);
      this.setEntry(path, {
        type: entry.kind,
        size: entry.kind === "file" ? entry.size : 0,
        mtime: t?.mtime ?? entry.lastModified,
        ctime: t?.ctime ?? entry.lastModified,
      });
    }
    return new Map(this.index);
  }

  private setEntry(path: string, stat: Stat) {
    this.index.set(path, stat);
    this.unicodeIndex.set(unicodeKey(path), path);
  }

  private deleteEntry(path: string) {
    this.index.delete(path);
    if (this.unicodeIndex.get(unicodeKey(path)) === path) this.unicodeIndex.delete(unicodeKey(path));
  }

  /**
   * Schlüssel für einen Pfad: der vorhandene Eintrag in seiner Schreibweise, sonst der Pfad selbst
   * – mit den Schreibweisen bereits vorhandener Elternordner.
   */
  private key(path: string): string {
    const p = cleanPath(path);
    if (p === "/" || this.index.has(p)) return p;
    const existing = this.unicodeIndex.get(unicodeKey(p));
    if (existing) return existing;
    const dir = dirname(p);
    return dir === "/" ? p : join(this.key(dir), basename(p));
  }

  watch(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: AdapterChange) {
    for (const listener of this.listeners) listener(change);
  }

  private lookup(path: string, sensitive = true): string | undefined {
    const p = this.key(path);
    if (this.index.has(p)) return p;
    if (sensitive) return undefined;
    const lower = p.toLowerCase();
    for (const key of this.index.keys()) if (key.toLowerCase() === lower) return key;
    return undefined;
  }

  async exists(path: string, sensitive = true): Promise<boolean> {
    return cleanPath(path) === "/" || this.lookup(path, sensitive) !== undefined;
  }

  async stat(path: string): Promise<Stat | null> {
    const p = this.key(path);
    if (p === "/") return { type: "folder", size: 0, mtime: 0, ctime: 0 };
    const stat = this.index.get(p);
    return stat ? { ...stat } : null;
  }

  async list(path: string): Promise<ListedFiles> {
    const dir = this.key(path);
    const result: ListedFiles = { files: [], folders: [] };
    for (const [p, stat] of this.index) {
      if (dirname(p) !== dir) continue;
      (stat.type === "file" ? result.files : result.folders).push(p);
    }
    return result;
  }

  async read(path: string): Promise<string> {
    return decoder.decode(await this.readBinary(path));
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const p = this.key(path);
    if (this.index.get(p)?.type !== "file") throw new Error(`ENOENT: no such file, open '${p}'`);
    return this.backend.readFile(p);
  }

  async write(path: string, data: string, options?: DataWriteOptions): Promise<void> {
    await this.writeBinary(path, encoder.encode(data).buffer as ArrayBuffer, options);
  }

  async writeBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<void> {
    const p = this.key(path);
    const existing = this.index.get(p);
    if (existing?.type === "folder") throw new Error(`EISDIR: '${p}' is a folder`);
    await this.mkdirp(dirname(p));
    await this.backend.writeFile(p, data);

    const now = Date.now();
    const mtime = options?.mtime ?? now;
    const ctime = options?.ctime ?? existing?.ctime ?? mtime;
    const stat: Stat = { type: "file", size: data.byteLength, mtime, ctime };
    this.setEntry(p, stat);
    await this.times.set(p, { mtime, ctime });
    this.emit({ type: existing ? "modify" : "create", path: p, stat: { ...stat } });
  }

  async append(path: string, data: string, options?: DataWriteOptions): Promise<void> {
    const current = (await this.exists(path)) ? await this.read(path) : "";
    await this.write(path, current + data, options);
  }

  async process(path: string, fn: (data: string) => string, options?: DataWriteOptions): Promise<string> {
    const result = fn(await this.read(path));
    await this.write(path, result, options);
    return result;
  }

  async mkdir(path: string): Promise<void> {
    await this.mkdirp(this.key(path));
  }

  private async mkdirp(dir: string): Promise<void> {
    if (dir === "/") return;
    for (const folder of [...ancestors(dir), dir]) {
      const existing = this.index.get(folder);
      if (existing?.type === "folder") continue;
      if (existing) throw new Error(`ENOTDIR: '${folder}' is a file`);
      await this.backend.mkdir(folder);
      const now = Date.now();
      const stat: Stat = { type: "folder", size: 0, mtime: now, ctime: now };
      this.setEntry(folder, stat);
      // Auch Ordner erfassen, damit `scan` ihre Schreibweise wiederherstellen kann.
      await this.times.set(folder, { mtime: now, ctime: now });
      this.emit({ type: "create", path: folder, stat: { ...stat } });
    }
  }

  private subtree(path: string): string[] {
    const prefix = `${path}/`;
    return [...this.index.keys()].filter((p) => p === path || p.startsWith(prefix));
  }

  private async dropFromIndex(path: string) {
    const paths = this.subtree(path);
    for (const p of paths) this.deleteEntry(p);
    await this.times.delete(paths);
  }

  async rmdir(path: string, recursive: boolean): Promise<void> {
    const p = this.key(path);
    if (this.index.get(p)?.type !== "folder") throw new Error(`ENOENT: no such folder '${p}'`);
    if (!recursive && this.subtree(p).length > 1) throw new Error(`ENOTEMPTY: '${p}'`);
    await this.backend.remove(p);
    await this.dropFromIndex(p);
    this.emit({ type: "delete", path: p, kind: "folder" });
  }

  async remove(path: string): Promise<void> {
    const p = this.key(path);
    if (this.index.get(p)?.type !== "file") throw new Error(`ENOENT: no such file '${p}'`);
    await this.backend.remove(p);
    await this.dropFromIndex(p);
    this.emit({ type: "delete", path: p, kind: "file" });
  }

  /** Kopieren + Löschen: OPFS hat kein portables `move`. mtimes bleiben erhalten. */
  async rename(path: string, newPath: string): Promise<void> {
    const from = this.key(path);
    const to = this.key(newPath);
    const root = this.index.get(from);
    if (!root) throw new Error(`ENOENT: '${from}'`);
    if (from === to) return;
    const caseOnly = from.toLowerCase() === to.toLowerCase();
    if (this.index.has(to) && !caseOnly) throw new Error(`EEXIST: '${to}'`);

    // Ordner vor ihrem Inhalt; der Vault soll nur ein einziges `rename` sehen.
    const moved = this.subtree(from).sort();
    const entries = moved.map((p) => ({ rel: p.slice(from.length), kind: this.index.get(p)!.type }));
    await this.mkdirp(dirname(to));
    if (caseOnly) {
      // Case-insensitive Backends: über einen Zwischennamen gehen.
      const tmp = `${to}.renaming-${Date.now()}`;
      await this.backendMove(from, tmp, entries);
      await this.backendMove(tmp, to, entries);
    } else {
      await this.backendMove(from, to, entries);
    }

    for (const p of moved) {
      const stat = this.index.get(p)!;
      const target = to + p.slice(from.length);
      this.deleteEntry(p);
      this.setEntry(target, stat);
    }
    await this.times.delete(moved);
    for (const p of moved) {
      const stat = this.index.get(to + p.slice(from.length))!;
      await this.times.set(to + p.slice(from.length), { mtime: stat.mtime, ctime: stat.ctime });
    }
    this.emit({ type: "rename", path: to, oldPath: from, stat: { ...root } });
  }

  private async backendMove(from: string, to: string, entries: { rel: string; kind: Stat["type"] }[]) {
    for (const { rel, kind } of entries) {
      if (kind === "folder") await this.backend.mkdir(to + rel);
      else await this.backend.writeFile(to + rel, await this.backend.readFile(from + rel));
    }
    await this.backend.remove(from);
  }

  async copy(path: string, newPath: string): Promise<void> {
    const from = this.key(path);
    const stat = this.index.get(from);
    if (stat?.type !== "file") throw new Error(`ENOENT: '${from}'`);
    if (this.index.has(this.key(newPath))) throw new Error(`EEXIST: '${newPath}'`);
    await this.writeBinary(newPath, await this.readBinary(from), { mtime: stat.mtime });
  }

  async trashSystem(): Promise<boolean> {
    return false; // Kein Papierkorb des Betriebssystems im Browser.
  }

  async trashLocal(path: string): Promise<void> {
    const p = this.key(path);
    let target = join(TRASH_DIR, basename(p));
    for (let i = 2; this.index.has(target); i++) {
      const name = basename(p);
      const dot = name.lastIndexOf(".");
      target = join(TRASH_DIR, dot > 0 ? `${name.slice(0, dot)} ${i}${name.slice(dot)}` : `${name} ${i}`);
    }
    await this.mkdirp(TRASH_DIR);
    await this.rename(p, target);
  }

  getResourcePath(path: string): string {
    // TODO: Service Worker, der /__vault/<pfad> aus dem Speicher ausliefert (Bilder, PDFs).
    const p = this.key(path);
    return `/__vault/${encodeURIComponent(this.name)}/${encodeURI(p)}?${this.index.get(p)?.mtime ?? 0}`;
  }
}

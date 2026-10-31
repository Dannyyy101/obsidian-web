import { Events } from "../shared/events";
import { basename, cleanPath, dirname, isHiddenPath, normalizePath, unicodeKey } from "../shared/path";
import type { AdapterChange, DataAdapter, DataWriteOptions, Stat } from "../storage/data-adapter";

export interface FileStats {
  ctime: number;
  mtime: number;
  size: number;
}

export abstract class TAbstractFile {
  vault: Vault;
  path: string;
  name: string;
  parent: TFolder | null = null;

  constructor(vault: Vault, path: string) {
    this.vault = vault;
    this.path = path;
    this.name = path === "/" ? "" : basename(path);
  }

  /** @internal */
  setPath(path: string) {
    this.path = path;
    this.name = basename(path);
  }
}

export class TFile extends TAbstractFile {
  stat: FileStats;
  basename = "";
  extension = "";

  constructor(vault: Vault, path: string, stat: FileStats) {
    super(vault, path);
    this.stat = stat;
    this.setPath(path);
  }

  override setPath(path: string) {
    super.setPath(path);
    const dot = this.name.lastIndexOf(".");
    this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
    this.extension = dot > 0 ? this.name.slice(dot + 1).toLowerCase() : "";
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];

  isRoot(): boolean {
    return this.path === "/";
  }
}

/**
 * Der Dateibaum des Vaults. Er spiegelt die Änderungen des Adapters (`watch`) – egal ob sie aus der
 * App, aus Plugins oder vom Sync stammen – und sendet daraus die Obsidian-Events
 * `create`, `modify`, `delete`, `rename` und `raw`. Versteckte Pfade (`.obsidian`, `.trash` …)
 * sind wie in Obsidian nicht Teil des Baums.
 */
export class Vault extends Events {
  readonly adapter: DataAdapter;
  readonly configDir = ".obsidian";
  private root: TFolder;
  private fileMap = new Map<string, TAbstractFile>();
  private textCache = new Map<string, { mtime: number; size: number; text: string }>();
  /** unicodeKey(pfad) → Datei: findet Pfade unabhängig von NFC/NFD. */
  private unicodeMap = new Map<string, TAbstractFile>();

  constructor(adapter: DataAdapter) {
    super();
    this.adapter = adapter;
    this.root = new TFolder(this, "/");
    this.mapFile(this.root);
  }

  private config: Record<string, unknown> = {};

  private get configPath() {
    return `${this.configDir}/app.json`;
  }

  /** Baut den Baum auf, ohne Events zu senden, und abonniert danach die Adapter-Änderungen. */
  async load(): Promise<void> {
    const stats = await this.adapter.scan();
    await this.loadConfig();
    const paths = [...stats.keys()].filter((p) => !isHiddenPath(p)).sort();
    for (const path of paths) this.insert(path, stats.get(path)!);
    this.adapter.watch((change) => this.onAdapterChange(change));
  }

  getName(): string {
    return this.adapter.getName();
  }

  private async loadConfig() {
    try {
      if (await this.adapter.exists(this.configPath)) this.config = JSON.parse(await this.adapter.read(this.configPath));
    } catch (err) {
      console.error(`${this.configPath} ist kein gültiges JSON`, err);
    }
  }

  /** Einstellung aus `.obsidian/app.json` (wie Obsidians internes `vault.getConfig`). */
  getConfig(key: string): unknown {
    return this.config[key];
  }

  async setConfig(key: string, value: unknown): Promise<void> {
    await this.loadConfig(); // Änderungen durch den Sync nicht überschreiben
    if (value === undefined) delete this.config[key];
    else this.config[key] = value;
    await this.adapter.write(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getRoot(): TFolder {
    return this.root;
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    const p = cleanPath(path);
    return this.fileMap.get(p) ?? this.unicodeMap.get(unicodeKey(normalizePath(p))) ?? null;
  }

  getFileByPath(path: string): TFile | null {
    const file = this.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  getFolderByPath(path: string): TFolder | null {
    const folder = this.getAbstractFileByPath(path);
    return folder instanceof TFolder ? folder : null;
  }

  getAllLoadedFiles(): TAbstractFile[] {
    return [...this.fileMap.values()];
  }

  getAllFolders(includeRoot = false): TFolder[] {
    return [...this.fileMap.values()].filter(
      (f): f is TFolder => f instanceof TFolder && (includeRoot || !f.isRoot()),
    );
  }

  getFiles(): TFile[] {
    return [...this.fileMap.values()].filter((f): f is TFile => f instanceof TFile);
  }

  getMarkdownFiles(): TFile[] {
    return this.getFiles().filter((f) => f.extension === "md");
  }

  read(file: TFile): Promise<string> {
    return this.adapter.read(file.path);
  }

  /** Wie `read`, aber aus dem Speicher, solange mtime und Größe unverändert sind. */
  async cachedRead(file: TFile): Promise<string> {
    const cached = this.textCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) return cached.text;
    const { mtime, size } = file.stat;
    const text = await this.read(file);
    this.textCache.set(file.path, { mtime, size, text });
    return text;
  }

  readBinary(file: TFile): Promise<ArrayBuffer> {
    return this.adapter.readBinary(file.path);
  }

  getResourcePath(file: TFile): string {
    return this.adapter.getResourcePath(file.path);
  }

  async create(path: string, data: string, options?: DataWriteOptions): Promise<TFile> {
    const p = this.assertNew(path);
    await this.adapter.write(p, data, options);
    return this.getFileByPath(p)!;
  }

  async createBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<TFile> {
    const p = this.assertNew(path);
    await this.adapter.writeBinary(p, data, options);
    return this.getFileByPath(p)!;
  }

  async createFolder(path: string): Promise<TFolder> {
    const p = this.assertNew(path);
    await this.adapter.mkdir(p);
    return this.getFolderByPath(p)!;
  }

  async modify(file: TFile, data: string, options?: DataWriteOptions): Promise<void> {
    await this.adapter.write(file.path, data, options);
  }

  async modifyBinary(file: TFile, data: ArrayBuffer, options?: DataWriteOptions): Promise<void> {
    await this.adapter.writeBinary(file.path, data, options);
  }

  async append(file: TFile, data: string, options?: DataWriteOptions): Promise<void> {
    await this.adapter.append(file.path, data, options);
  }

  async process(file: TFile, fn: (data: string) => string, options?: DataWriteOptions): Promise<string> {
    return this.adapter.process(file.path, fn, options);
  }

  /** Ordner werden immer rekursiv gelöscht; `force` betrifft in Obsidian nur versteckte Kinder. */
  async delete(file: TAbstractFile, _force = false): Promise<void> {
    if (file instanceof TFolder) await this.adapter.rmdir(file.path, true);
    else await this.adapter.remove(file.path);
  }

  async trash(file: TAbstractFile, system: boolean): Promise<void> {
    if (system && (await this.adapter.trashSystem(file.path))) return;
    await this.adapter.trashLocal(file.path);
  }

  async rename(file: TAbstractFile, newPath: string): Promise<void> {
    await this.adapter.rename(file.path, normalizePath(newPath));
  }

  async copy(file: TFile, newPath: string): Promise<TFile> {
    const p = this.assertNew(newPath);
    await this.adapter.copy(file.path, p);
    return this.getFileByPath(p)!;
  }

  /** Obsidians `getAvailablePath`: `pfad.ext`, bei Kollision `pfad 1.ext`, `pfad 2.ext` … */
  getAvailablePath(path: string, extension: string): string {
    const withExt = (p: string) => (extension ? `${p}.${extension}` : p);
    let candidate = withExt(path);
    for (let i = 1; this.getAbstractFileByPath(candidate); i++) candidate = withExt(`${path} ${i}`);
    return candidate;
  }

  private assertNew(path: string): string {
    const p = normalizePath(path);
    if (this.getAbstractFileByPath(p)) throw new Error("File already exists.");
    return p;
  }

  // --- Baumpflege -----------------------------------------------------------------------------

  private insert(path: string, stat: Stat): TAbstractFile {
    const parent = this.ensureFolder(dirname(path));
    const file =
      stat.type === "folder"
        ? new TFolder(this, path)
        : new TFile(this, path, { ctime: stat.ctime, mtime: stat.mtime, size: stat.size });
    file.parent = parent;
    parent.children.push(file);
    this.mapFile(file);
    return file;
  }

  private mapFile(file: TAbstractFile) {
    this.fileMap.set(file.path, file);
    this.unicodeMap.set(unicodeKey(file.path), file);
  }

  private unmapFile(file: TAbstractFile) {
    this.textCache.delete(file.path);
    this.fileMap.delete(file.path);
    if (this.unicodeMap.get(unicodeKey(file.path)) === file) this.unicodeMap.delete(unicodeKey(file.path));
  }

  private ensureFolder(path: string): TFolder {
    const existing = this.fileMap.get(path);
    if (existing instanceof TFolder) return existing;
    return this.insert(path, { type: "folder", ctime: 0, mtime: 0, size: 0 }) as TFolder;
  }

  private detach(file: TAbstractFile) {
    if (file.parent) file.parent.children = file.parent.children.filter((c) => c !== file);
    file.parent = null;
  }

  /** Alle Nachfahren, die tiefsten zuerst. */
  private descendants(folder: TFolder): TAbstractFile[] {
    return folder.children.flatMap((c) => [...(c instanceof TFolder ? this.descendants(c) : []), c]);
  }

  private onAdapterChange(change: AdapterChange) {
    switch (change.type) {
      case "create":
      case "modify":
        this.onWrite(change.path, change.stat);
        break;
      case "delete":
        this.onDelete(change.path);
        break;
      case "rename":
        this.onRename(change.oldPath, change.path, change.stat);
        break;
    }
    this.trigger("raw", change.path);
  }

  private onWrite(path: string, stat: Stat) {
    if (isHiddenPath(path)) return;
    const existing = this.fileMap.get(path);
    if (existing instanceof TFile && stat.type === "file") {
      existing.stat = { ctime: stat.ctime, mtime: stat.mtime, size: stat.size };
      this.trigger("modify", existing);
    } else if (!existing) {
      this.trigger("create", this.insert(path, stat));
    }
  }

  private onDelete(path: string) {
    const file = this.fileMap.get(path);
    if (!file) return;
    const removed = file instanceof TFolder ? [...this.descendants(file), file] : [file];
    this.detach(file);
    for (const f of removed) {
      this.unmapFile(f);
      this.trigger("delete", f);
    }
  }

  private onRename(oldPath: string, newPath: string, stat: Stat) {
    const file = this.fileMap.get(oldPath);
    if (isHiddenPath(newPath)) return this.onDelete(oldPath);
    if (!file) return this.reinsertSubtree(newPath, stat);

    const moved = [file, ...(file instanceof TFolder ? this.descendants(file) : [])];
    const oldPaths = new Map(moved.map((f) => [f, f.path]));
    this.detach(file);
    for (const f of moved) this.unmapFile(f);
    for (const f of moved) {
      f.setPath(newPath + f.path.slice(oldPath.length));
      this.mapFile(f);
    }
    const parent = this.ensureFolder(dirname(newPath));
    file.parent = parent;
    parent.children.push(file);
    for (const f of moved) this.trigger("rename", f, oldPaths.get(f));
  }

  /** Datei wurde aus einem versteckten Pfad (z. B. `.trash`) zurück in den Vault verschoben. */
  private async reinsertSubtree(path: string, stat: Stat) {
    if (stat.type === "file") return this.onWrite(path, stat);
    this.onWrite(path, stat);
    const listed = await this.adapter.list(path);
    for (const folder of listed.folders) {
      const s = await this.adapter.stat(folder);
      if (s) await this.reinsertSubtree(folder, s);
    }
    for (const filePath of listed.files) {
      const s = await this.adapter.stat(filePath);
      if (s) this.onWrite(filePath, s);
    }
  }
}

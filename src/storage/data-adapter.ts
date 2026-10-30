// Entspricht Obsidians `DataAdapter`, ergänzt um `watch`, über das der Vault Änderungen erfährt
// – auch solche, die Plugins wie remotely-save direkt über den Adapter schreiben.
export interface Stat {
  type: "file" | "folder";
  ctime: number;
  mtime: number;
  size: number;
}

export interface ListedFiles {
  files: string[];
  folders: string[];
}

export interface DataWriteOptions {
  ctime?: number;
  mtime?: number;
}

export type AdapterChange =
  | { type: "create" | "modify"; path: string; stat: Stat }
  | { type: "delete"; path: string; kind: Stat["type"] }
  | { type: "rename"; path: string; oldPath: string; stat: Stat };

export type ChangeListener = (change: AdapterChange) => void;

export interface DataAdapter {
  getName(): string;
  /** Rekursives Listing des gesamten Vaults (inkl. versteckter Pfade) für den initialen Aufbau. */
  scan(): Promise<Map<string, Stat>>;
  watch(listener: ChangeListener): () => void;

  exists(path: string, sensitive?: boolean): Promise<boolean>;
  stat(path: string): Promise<Stat | null>;
  list(path: string): Promise<ListedFiles>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  write(path: string, data: string, options?: DataWriteOptions): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<void>;
  append(path: string, data: string, options?: DataWriteOptions): Promise<void>;
  process(path: string, fn: (data: string) => string, options?: DataWriteOptions): Promise<string>;
  mkdir(path: string): Promise<void>;
  rmdir(path: string, recursive: boolean): Promise<void>;
  remove(path: string): Promise<void>;
  rename(path: string, newPath: string): Promise<void>;
  copy(path: string, newPath: string): Promise<void>;
  trashSystem(path: string): Promise<boolean>;
  trashLocal(path: string): Promise<void>;
  getResourcePath(path: string): string;
}

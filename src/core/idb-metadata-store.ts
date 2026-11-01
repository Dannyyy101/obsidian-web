import type { MetadataStore, StoredMetadata } from "./metadata-cache";

const DB_NAME = "obsidian-web-metadata";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/** Metadaten je Datei in IndexedDB (verwerfbar – der Vault ist die Wahrheit). Schlüssel `<vault>\0<pfad>`. */
export class IdbMetadataStore implements MetadataStore {
  private db = openDb();

  constructor(private vaultName: string) {}

  private key(path: string) {
    return `${this.vaultName}\u0000${path}`;
  }

  async load(): Promise<Map<string, StoredMetadata>> {
    const prefix = this.key("");
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    const store = (await this.db).transaction(STORE, "readonly").objectStore(STORE);
    const [keys, values] = await Promise.all([
      request<IDBValidKey[]>(store.getAllKeys(range)),
      request<StoredMetadata[]>(store.getAll(range)),
    ]);
    return new Map(keys.map((k, i) => [String(k).slice(prefix.length), values[i]]));
  }

  async set(path: string, entry: StoredMetadata): Promise<void> {
    const tx = (await this.db).transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry, this.key(path));
    await done(tx);
  }

  async delete(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const tx = (await this.db).transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const path of paths) store.delete(this.key(path));
    await done(tx);
  }
}

import type { FileTimes, TimesStore } from "./indexed-adapter";

const DB_NAME = "obsidian-web";
const STORE = "file-times";

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

/** mtime/ctime je Datei in IndexedDB, Schlüssel `<vault>\0<pfad>`. */
export class IdbTimesStore implements TimesStore {
  private db = openDb();

  constructor(private vaultName: string) {}

  private key(path: string) {
    return `${this.vaultName}\u0000${path}`;
  }

  async load(): Promise<Map<string, FileTimes>> {
    const db = await this.db;
    const prefix = this.key("");
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const [keys, values] = await Promise.all([
      request<IDBValidKey[]>(store.getAllKeys(range)),
      request<FileTimes[]>(store.getAll(range)),
    ]);
    return new Map(keys.map((k, i) => [String(k).slice(prefix.length), values[i]]));
  }

  async set(path: string, times: FileTimes): Promise<void> {
    const tx = (await this.db).transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(times, this.key(path));
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

function request<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

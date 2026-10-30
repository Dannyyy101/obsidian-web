import type { FileTimes, StorageBackend, TimesStore } from "./indexed-adapter";

/** Flüchtiger Speicher für Tests und Demo-Vaults. */
export class MemoryBackend implements StorageBackend {
  files = new Map<string, ArrayBuffer>();
  folders = new Set<string>();

  async walk() {
    return [
      ...[...this.folders].map((path) => ({ path, kind: "folder" as const, size: 0, lastModified: 1 })),
      ...[...this.files].map(([path, data]) => ({
        path,
        kind: "file" as const,
        size: data.byteLength,
        lastModified: 1,
      })),
    ];
  }

  async readFile(path: string) {
    const data = this.files.get(path);
    if (!data) throw new Error(`not found: ${path}`);
    return data.slice(0);
  }

  async writeFile(path: string, data: ArrayBuffer) {
    this.files.set(path, data.slice(0));
  }

  async mkdir(path: string) {
    this.folders.add(path);
  }

  async remove(path: string) {
    const prefix = `${path}/`;
    for (const p of [...this.files.keys()]) if (p === path || p.startsWith(prefix)) this.files.delete(p);
    for (const p of [...this.folders]) if (p === path || p.startsWith(prefix)) this.folders.delete(p);
  }
}

export class MemoryTimesStore implements TimesStore {
  times = new Map<string, FileTimes>();

  async load() {
    return new Map(this.times);
  }

  async set(path: string, times: FileTimes) {
    this.times.set(path, times);
  }

  async delete(paths: string[]) {
    for (const p of paths) this.times.delete(p);
  }
}

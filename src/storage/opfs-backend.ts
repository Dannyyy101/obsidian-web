import { unicodeKey } from "../shared/path";
import type { StorageBackend } from "./indexed-adapter";

/**
 * Origin Private File System: läuft in allen aktuellen Browsern ohne Berechtigungsdialog.
 * Namen werden unabhängig von der Unicode-Form aufgelöst: Safari legt OPFS-Namen in NFD ab und
 * liefert sie so zurück, auch wenn sie in NFC geschrieben wurden.
 */
export class OpfsBackend implements StorageBackend {
  private constructor(private root: FileSystemDirectoryHandle) {}

  static async open(vaultName: string): Promise<OpfsBackend> {
    const opfs = await navigator.storage.getDirectory();
    const vaults = await opfs.getDirectoryHandle("vaults", { create: true });
    return new OpfsBackend(await vaults.getDirectoryHandle(vaultName, { create: true }));
  }

  static async listVaults(): Promise<string[]> {
    const opfs = await navigator.storage.getDirectory();
    const vaults = await opfs.getDirectoryHandle("vaults", { create: true });
    const names: string[] = [];
    for await (const [name, handle] of entries(vaults)) if (handle.kind === "directory") names.push(name);
    return names.sort();
  }

  /** Tatsächlicher Name eines Eintrags im Ordner (exakt oder in anderer Unicode-Form), sonst null. */
  private async resolveName(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
    // Schneller Weg: exakter Name. Nur wenn er fehlt, den Ordner durchsuchen.
    if (await exists(dir, name)) return name;
    const wanted = unicodeKey(name);
    for await (const [entryName] of entries(dir)) if (unicodeKey(entryName) === wanted) return entryName;
    return null;
  }

  private async dir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let handle = this.root;
    if (path === "/" || path === "") return handle;
    for (const part of path.split("/")) {
      const actual = await this.resolveName(handle, part);
      handle = await handle.getDirectoryHandle(actual ?? part, { create: create && actual === null });
    }
    return handle;
  }

  private async parentAndName(path: string, create = false): Promise<[FileSystemDirectoryHandle, string]> {
    const i = path.lastIndexOf("/");
    const parent = i < 0 ? this.root : await this.dir(path.slice(0, i), create);
    const name = path.slice(i + 1);
    return [parent, (await this.resolveName(parent, name)) ?? name];
  }

  async walk() {
    const result: Awaited<ReturnType<StorageBackend["walk"]>> = [];
    const visit = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, handle] of entries(dir)) {
        const path = prefix ? `${prefix}/${name}` : name; // Schreibweise des Backends; der Adapter stellt die ursprüngliche wieder her
        if (handle.kind === "directory") {
          result.push({ path, kind: "folder", size: 0, lastModified: 0 });
          await visit(handle as FileSystemDirectoryHandle, path);
        } else {
          const file = await (handle as FileSystemFileHandle).getFile();
          result.push({ path, kind: "file", size: file.size, lastModified: file.lastModified });
        }
      }
    };
    await visit(this.root, "");
    return result;
  }

  async readFile(path: string): Promise<ArrayBuffer> {
    const [parent, name] = await this.parentAndName(path);
    const file = await (await parent.getFileHandle(name)).getFile();
    return file.arrayBuffer();
  }

  async writeFile(path: string, data: ArrayBuffer): Promise<void> {
    const [parent, name] = await this.parentAndName(path, true);
    const handle = await parent.getFileHandle(name, { create: true });
    // TODO: Safari < 18.2 kennt createWritable nicht → Fallback über createSyncAccessHandle im Worker.
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  async mkdir(path: string): Promise<void> {
    await this.dir(path, true);
  }

  async remove(path: string): Promise<void> {
    const [parent, name] = await this.parentAndName(path);
    await parent.removeEntry(name, { recursive: true });
  }
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  for (const get of [() => dir.getFileHandle(name), () => dir.getDirectoryHandle(name)]) {
    try {
      await get();
      return true;
    } catch (err) {
      // TypeMismatchError: existiert, aber als anderer Typ → nächster Versuch.
      if (!(err instanceof DOMException) || !["NotFoundError", "TypeMismatchError"].includes(err.name)) throw err;
    }
  }
  return false;
}

// `entries()` fehlt in den DOM-Typen von TypeScript noch.
function entries(dir: FileSystemDirectoryHandle): AsyncIterable<[string, FileSystemHandle]> {
  return (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries();
}

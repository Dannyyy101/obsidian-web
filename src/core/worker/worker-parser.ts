import type { CachedMetadata } from "../../markdown/metadata";
import type { MetadataParser } from "../metadata-cache";

/** MetadataParser über einen Web Worker: große Vaults blockieren die Oberfläche nicht. */
export function createWorkerParser(): MetadataParser {
  const worker = new Worker(new URL("./metadata.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { resolve: (m: CachedMetadata) => void; reject: (e: Error) => void }>();
  let nextId = 0;
  worker.onmessage = (evt: MessageEvent<{ id: number; meta?: CachedMetadata; error?: string }>) => {
    const job = pending.get(evt.data.id);
    if (!job) return;
    pending.delete(evt.data.id);
    if (evt.data.meta) job.resolve(evt.data.meta);
    else job.reject(new Error(evt.data.error));
  };
  return (text) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, text });
    });
}

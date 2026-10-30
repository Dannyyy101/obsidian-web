// Parst Notizen außerhalb des Main-Threads (siehe createWorkerParser).
import { computeMetadata } from "../../markdown/metadata";

self.onmessage = (evt: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = evt.data;
  try {
    self.postMessage({ id, meta: computeMetadata(text) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};

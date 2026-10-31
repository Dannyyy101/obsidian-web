import type { Extension } from "@codemirror/state";
import { type EditorView, ViewPlugin } from "@codemirror/view";
import { Vim, vim } from "@replit/codemirror-vim";

interface VimHost {
  save(): unknown;
  close(): unknown;
}

const hosts = new WeakMap<EditorView, VimHost>();
let exCommandsDefined = false;

/** `:w`, `:q`, `:wq` wirken auf den Tab, dessen Editor den Befehl ausführt. */
function defineExCommands() {
  if (exCommandsDefined) return;
  exCommandsDefined = true;
  const host = (cm: { cm6: EditorView }) => hosts.get(cm.cm6);
  Vim.defineEx("write", "w", (cm) => void host(cm)?.save());
  Vim.defineEx("quit", "q", (cm) => void host(cm)?.close());
  Vim.defineEx("wq", "wq", async (cm) => {
    await host(cm)?.save();
    await host(cm)?.close();
  });
}

/**
 * Vim-Modus wie Obsidians Einstellung `vimMode`. Muss vor allen anderen Keymaps stehen, damit
 * Vim die Tasten im Normalmodus zuerst bekommt.
 */
export function vimMode(host: VimHost): Extension {
  defineExCommands();
  const register = ViewPlugin.define((view) => {
    hosts.set(view, host);
    return { destroy: () => hosts.delete(view) };
  });
  return [vim({ status: true }), register];
}

import type { Hotkey } from "./hotkeys";

// Entspricht Obsidians `Command`. Editor-Callbacks folgen, sobald es eine Editor-Fassade gibt.
export interface Command {
  id: string;
  name: string;
  icon?: string;
  /** Standardkürzel; `hotkeys.json` kann sie ersetzen. */
  hotkeys?: Hotkey[];
  callback?: () => unknown;
  checkCallback?: (checking: boolean) => boolean | void;
}

export class Commands {
  commands = new Map<string, Command>();

  addCommand(command: Command): void {
    this.commands.set(command.id, command);
  }

  removeCommand(id: string): void {
    this.commands.delete(id);
  }

  /** Befehle, die im aktuellen Zustand ausführbar sind (für die Befehlspalette). */
  listCommands(): Command[] {
    return [...this.commands.values()]
      .filter((c) => (c.checkCallback ? c.checkCallback(true) !== false : !!c.callback))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  executeCommandById(id: string): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    if (command.checkCallback) return command.checkCallback(false) !== false;
    command.callback?.();
    return true;
  }
}

import { selectAll } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { Menu } from "../ui/menu";
import { formattingCommand } from "./formatting";

/** Kontextmenü des Editors wie in Obsidian; `onMenu` lässt Plugins Einträge ergänzen (`editor-menu`). */
export function showEditorMenu(view: EditorView, evt: MouseEvent, onMenu: (menu: Menu) => void): Menu {
  const menu = new Menu();
  const hasSelection = view.state.selection.ranges.some((r) => !r.empty);
  const add = (target: Menu, id: string, title?: string) => {
    const command = formattingCommand(id);
    target.addItem((item) =>
      item
        .setTitle(title ?? command.name)
        .setIcon(command.icon)
        .onClick(() => {
          command.run(view);
          view.focus();
        }),
    );
  };

  menu.addItem((item) =>
    item
      .setTitle("Ausschneiden")
      .setIcon("scissors")
      .setDisabled(!hasSelection)
      .onClick(() => void copySelection(view, true)),
  );
  menu.addItem((item) =>
    item
      .setTitle("Kopieren")
      .setIcon("copy")
      .setDisabled(!hasSelection)
      .onClick(() => void copySelection(view, false)),
  );
  if (typeof navigator.clipboard?.readText === "function") {
    menu.addItem((item) => item.setTitle("Einfügen").setIcon("clipboard-paste").onClick(() => void paste(view)));
  }
  menu.addSeparator();

  add(menu, "editor:insert-link", "Link einfügen");
  menu.addItem((item) => {
    item.setTitle("Formatierung").setIcon("type");
    const sub = item.setSubmenu();
    for (const id of ["bold", "italics", "strikethrough", "highlight", "code", "inline-math", "comment"]) add(sub, `editor:toggle-${id}`);
    sub.addSeparator();
    add(sub, "editor:clear-formatting");
  });
  menu.addItem((item) => {
    item.setTitle("Absatz").setIcon("pilcrow");
    const sub = item.setSubmenu();
    for (const id of ["toggle-bullet-list", "toggle-numbered-list", "toggle-checklist-status"]) add(sub, `editor:${id}`);
    sub.addSeparator();
    for (let level = 1; level <= 6; level++) add(sub, `editor:set-heading-${level}`);
    add(sub, "editor:set-heading-0");
    sub.addSeparator();
    add(sub, "editor:toggle-blockquote");
  });
  menu.addItem((item) => {
    item.setTitle("Einfügen …").setIcon("plus");
    const sub = item.setSubmenu();
    for (const id of ["insert-wikilink", "insert-embed", "insert-table", "insert-callout", "insert-codeblock", "insert-mathblock", "insert-horizontal-rule"]) {
      add(sub, `editor:${id}`);
    }
  });
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Alles auswählen")
      .setIcon("text-select")
      .onClick(() => {
        selectAll(view);
        view.focus();
      }),
  );
  onMenu(menu);
  menu.showAtMouseEvent(evt);
  return menu;
}

async function copySelection(view: EditorView, cut: boolean) {
  const { state } = view;
  const text = state.selection.ranges.map((r) => state.sliceDoc(r.from, r.to)).join("\n");
  await navigator.clipboard?.writeText(text);
  if (cut) view.dispatch(state.replaceSelection(""), { userEvent: "delete.cut" });
  view.focus();
}

async function paste(view: EditorView) {
  try {
    const text = await navigator.clipboard.readText();
    view.dispatch(view.state.replaceSelection(text), { userEvent: "input.paste" });
  } catch {
    // Zugriff verweigert: Einfügen geht weiter über Cmd/Strg+V.
  }
  view.focus();
}

// Das Modul `obsidian`, das Community-Plugins per `require("obsidian")` erhalten.
// Umfang wächst mit den unterstützten Plugins; Referenz ist obsidian.d.ts aus obsidianmd/obsidian-api.
import moment from "moment";

export { App } from "../app/app";
export { Commands } from "../core/commands";
export { Component } from "../core/component";
export { FileManager } from "../core/file-manager";
export { MetadataCache, parseLinktext } from "../core/metadata-cache";
export { TAbstractFile, TFile, TFolder, Vault } from "../core/vault";
export { Events } from "../shared/events";
export { normalizePath } from "../shared/path";
export { addIcon, getIcon, getIconIds, removeIcon, setIcon } from "../ui/icons";
export { Menu, MenuItem } from "../ui/menu";
export { Modal } from "../ui/modal";
export { Notice } from "../ui/notice";
export {
  AbstractTextComponent,
  BaseComponent,
  ButtonComponent,
  DropdownComponent,
  ExtraButtonComponent,
  SearchComponent,
  Setting,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent,
  ValueComponent,
} from "../ui/setting";
export { Workspace } from "../ui/workspace";
export { apiVersion, Platform, requireApiVersion } from "./platform";
export { Plugin, PluginSettingTab } from "./plugin";
export { request, requestUrl } from "./request-url";
export { moment };

/** Nur für `instanceof`-Prüfungen: obsidian-web hat kein Dateisystem im Sinne von Node. */
export class FileSystemAdapter {}

export function debounce<T extends unknown[]>(cb: (...args: T) => unknown, timeout = 0, resetTimer = false) {
  let timer: number | undefined;
  let pending: T | null = null;
  const debounced = (...args: T) => {
    pending = args;
    if (timer !== undefined && !resetTimer) return debounced;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      const a = pending!;
      pending = null;
      cb(...a);
    }, timeout);
    return debounced;
  };
  debounced.cancel = () => {
    window.clearTimeout(timer);
    timer = undefined;
    return debounced;
  };
  debounced.run = () => {
    if (pending) cb(...pending);
    return debounced.cancel();
  };
  return debounced;
}

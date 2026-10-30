// Obsidians Erweiterungen eingebauter JS-Objekte (String.contains, Array.first, Math.clamp …) aus
// den globalen Typen von obsidian.d.ts. Community-Plugins setzen sie voraus. Ohne DOM.

declare global {
  interface ObjectConstructor {
    isEmpty(object: Record<string, any>): boolean;
    each<T>(object: { [key: string]: T }, callback: (value: T, key?: string) => boolean | void, context?: any): boolean;
  }
  interface ArrayConstructor {
    combine<T>(arrays: T[][]): T[];
  }
  interface Array<T> {
    first(): T | undefined;
    last(): T | undefined;
    contains(target: T): boolean;
    remove(target: T): void;
    shuffle(): this;
    unique(): T[];
  }
  interface Math {
    clamp(value: number, min: number, max: number): number;
    square(value: number): number;
  }
  interface StringConstructor {
    isString(obj: any): obj is string;
  }
  interface String {
    contains(target: string): boolean;
    format(...args: string[]): string;
  }
  interface NumberConstructor {
    isNumber(obj: any): obj is number;
  }
  function isBoolean(obj: any): obj is boolean;
}

// Nicht aufzählbar, damit `for…in` über Arrays und Objekte keine Zusatzschlüssel liefert.
function define(target: object, name: string, value: unknown) {
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}

export function installGlobalExtensions() {
  define(Object, "isEmpty", (object: Record<string, unknown>) => {
    for (const key in object) if (Object.prototype.hasOwnProperty.call(object, key)) return false;
    return true;
  });
  define(Object, "each", (object: Record<string, unknown>, callback: (value: unknown, key?: string) => boolean | void, context?: unknown) => {
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key) && callback.call(context, object[key], key) === false) return false;
    }
    return true;
  });

  define(Array, "combine", (arrays: unknown[][]) => ([] as unknown[]).concat(...arrays));
  const array = Array.prototype;
  define(array, "first", function (this: unknown[]) {
    return this[0];
  });
  define(array, "last", function (this: unknown[]) {
    return this[this.length - 1];
  });
  define(array, "contains", function (this: unknown[], target: unknown) {
    return this.indexOf(target) !== -1;
  });
  define(array, "remove", function (this: unknown[], target: unknown) {
    for (let i = this.length - 1; i >= 0; i--) if (this[i] === target) this.splice(i, 1);
  });
  define(array, "shuffle", function (this: unknown[]) {
    for (let i = this.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this[i], this[j]] = [this[j], this[i]];
    }
    return this;
  });
  define(array, "unique", function (this: unknown[]) {
    return Array.from(new Set(this));
  });

  define(Math, "clamp", (value: number, min: number, max: number) => Math.min(Math.max(value, min), max));
  define(Math, "square", (value: number) => value * value);

  define(String, "isString", (obj: unknown) => typeof obj === "string" || obj instanceof String);
  define(String.prototype, "contains", function (this: string, target: string) {
    return this.indexOf(target) !== -1;
  });
  define(String.prototype, "format", function (this: string, ...args: string[]) {
    return this.replace(/\{(\d+)\}/g, (match, i: string) => (args[Number(i)] !== undefined ? args[Number(i)] : match));
  });

  define(Number, "isNumber", (obj: unknown) => typeof obj === "number" || obj instanceof Number);
  define(globalThis, "isBoolean", (obj: unknown) => typeof obj === "boolean" || obj instanceof Boolean);
}

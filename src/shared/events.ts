// Entspricht Obsidians `Events` / `EventRef`.
export interface EventRef {
  e: Events;
  name: string;
  fn: (...data: any[]) => unknown;
  ctx?: unknown;
}

export class Events {
  private _events = new Map<string, EventRef[]>();

  on(name: string, callback: (...data: any[]) => unknown, ctx?: unknown): EventRef {
    const ref: EventRef = { e: this, name, fn: callback, ctx };
    const list = this._events.get(name) ?? [];
    list.push(ref);
    this._events.set(name, list);
    return ref;
  }

  off(name: string, callback: (...data: any[]) => unknown): void {
    const list = this._events.get(name);
    if (!list) return;
    this._events.set(name, list.filter((ref) => ref.fn !== callback));
  }

  offref(ref: EventRef): void {
    const list = this._events.get(ref.name);
    if (!list) return;
    this._events.set(ref.name, list.filter((r) => r !== ref));
  }

  trigger(name: string, ...data: unknown[]): void {
    for (const ref of [...(this._events.get(name) ?? [])]) this.tryTrigger(ref, data);
  }

  tryTrigger(ref: EventRef, args: unknown[]): void {
    try {
      ref.fn.apply(ref.ctx, args);
    } catch (err) {
      console.error(err);
    }
  }
}

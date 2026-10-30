import { beforeAll, describe, expect, it } from "vitest";
import { installGlobalExtensions } from "../src/shared/globals";

describe("Obsidians globale Erweiterungen", () => {
  beforeAll(() => installGlobalExtensions());

  it("String", () => {
    expect("https://s3.example.com/bucket".contains("bucket")).toBe(true);
    expect("abc".contains("x")).toBe(false);
    expect("{0} von {1}, {2}".format("1", "3")).toBe("1 von 3, {2}");
    expect(String.isString("a")).toBe(true);
    expect(String.isString(1)).toBe(false);
  });

  it("Array", () => {
    const a = [1, 2, 3, 2];
    expect(a.first()).toBe(1);
    expect(a.last()).toBe(2);
    expect([].first()).toBeUndefined();
    expect(a.contains(3)).toBe(true);
    expect(a.unique()).toEqual([1, 2, 3]);
    a.remove(2);
    expect(a).toEqual([1, 3]);
    expect([3, 1, 2].shuffle().sort()).toEqual([1, 2, 3]);
    expect(Array.combine([[1], [2, 3]])).toEqual([1, 2, 3]);
  });

  it("verändert for…in über Arrays und Objekte nicht", () => {
    const keys: string[] = [];
    for (const k in ["x"]) keys.push(k);
    for (const k in { y: 1 }) keys.push(k);
    expect(keys).toEqual(["0", "y"]);
  });

  it("Math, Number, Object, isBoolean", () => {
    expect(Math.clamp(5, 0, 3)).toBe(3);
    expect(Math.clamp(-1, 0, 3)).toBe(0);
    expect(Math.square(4)).toBe(16);
    expect(Number.isNumber(1)).toBe(true);
    expect(Number.isNumber("1")).toBe(false);
    expect(Object.isEmpty({})).toBe(true);
    expect(Object.isEmpty({ a: 1 })).toBe(false);
    const seen: string[] = [];
    expect(Object.each({ a: 1, b: 2, c: 3 }, (v, k) => (seen.push(k!), v < 2))).toBe(false);
    expect(seen).toEqual(["a", "b"]);
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(0)).toBe(false);
  });
});

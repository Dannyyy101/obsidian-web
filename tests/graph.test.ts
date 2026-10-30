import { describe, expect, it } from "vitest";
import { buildGraph, buildLocalGraph, DEFAULT_GRAPH_SETTINGS, ForceSimulation, type GraphSource } from "../src/core/graph";

const source: GraphSource = {
  files: [
    { path: "a.md", basename: "a", extension: "md" },
    { path: "b.md", basename: "b", extension: "md" },
    { path: "c.md", basename: "c", extension: "md" },
    { path: "d.md", basename: "d", extension: "md" },
    { path: "einsam.md", basename: "einsam", extension: "md" },
    { path: "bild.png", basename: "bild", extension: "png" },
  ],
  resolvedLinks: {
    "a.md": { "b.md": 2, "bild.png": 1 },
    "b.md": { "c.md": 1 },
    "c.md": { "d.md": 1 },
    "d.md": {},
    "einsam.md": {},
  },
  unresolvedLinks: { "a.md": { Fehlt: 1 } },
  tags: (path) => (path === "a.md" || path === "c.md" ? ["#projekt"] : []),
};

const filter = { showTags: false, showAttachments: false, hideUnresolved: false, showOrphans: true };
const ids = (g: { nodes: { id: string }[] }) => g.nodes.map((n) => n.id).sort();

describe("buildGraph", () => {
  it("enthält Notizen, nicht aufgelöste Links und Waisen", () => {
    const g = buildGraph(source, filter);
    expect(ids(g)).toEqual(["a.md", "b.md", "c.md", "d.md", "einsam.md", "unresolved:Fehlt"]);
    expect(g.links).toHaveLength(4);
    expect(g.nodes.find((n) => n.id === "unresolved:Fehlt")!.type).toBe("unresolved");
  });

  it("filtert nach Einstellungen", () => {
    const g = buildGraph(source, { showTags: true, showAttachments: true, hideUnresolved: true, showOrphans: false });
    expect(ids(g)).toEqual(["#projekt", "a.md", "b.md", "bild.png", "c.md", "d.md"]);
    expect(g.nodes.find((n) => n.id === "bild.png")!.type).toBe("attachment");
  });

  it("beschränkt auf Suchtreffer", () => {
    const g = buildGraph(source, { ...filter, hideUnresolved: true, include: new Set(["a.md", "b.md"]) });
    expect(ids(g)).toEqual(["a.md", "b.md"]);
    expect(g.links).toEqual([{ source: 0, target: 1 }]);
  });
});

describe("buildLocalGraph", () => {
  const opts = { depth: 1, incoming: true, outgoing: true, neighbors: false };
  it("zeigt die direkte Umgebung", () => {
    expect(ids(buildLocalGraph(source, "b.md", opts, filter))).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("folgt der Tiefe und der Richtung", () => {
    expect(ids(buildLocalGraph(source, "b.md", { ...opts, depth: 2 }, filter))).toEqual(["a.md", "b.md", "c.md", "d.md", "unresolved:Fehlt"]);
    expect(ids(buildLocalGraph(source, "b.md", { ...opts, depth: 3, incoming: false }, filter))).toEqual(["b.md", "c.md", "d.md"]);
  });
});

describe("ForceSimulation", () => {
  it("kommt zur Ruhe, ohne dass Knoten übereinanderliegen", () => {
    const g = buildGraph(source, filter);
    const sim = new ForceSimulation(g, DEFAULT_GRAPH_SETTINGS);
    let ticks = 0;
    while (sim.isRunning() && ticks++ < 1000) sim.tick();
    expect(sim.isRunning()).toBe(false);
    const pos = (id: string) => g.nodes.find((n) => n.id === id)!;
    const dist = (a: string, b: string) => Math.hypot(pos(a).x - pos(b).x, pos(a).y - pos(b).y);
    for (const n of g.nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
    // Keine zwei Knoten übereinander.
    for (const a of g.nodes) for (const b of g.nodes) if (a !== b) expect(dist(a.id, b.id)).toBeGreaterThan(30);
  });

  it("übernimmt Positionen bei neuen Daten", () => {
    const g = buildGraph(source, filter);
    const sim = new ForceSimulation(g, DEFAULT_GRAPH_SETTINGS);
    for (let i = 0; i < 50; i++) sim.tick();
    const next = buildGraph(source, filter);
    sim.setData(next, g);
    expect(next.nodes.find((n) => n.id === "a.md")!.x).toBe(g.nodes.find((n) => n.id === "a.md")!.x);
  });
});

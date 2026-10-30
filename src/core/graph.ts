// Graph-Ansicht ohne DOM: Knoten und Kanten aus dem Link-Index und eine Kräftesimulation
// (Abstoßung per Barnes-Hut, Federn entlang der Links, Zug zur Mitte).

/** Einstellungen wie in Obsidians `.obsidian/graph.json` (Felder, die obsidian-web auswertet). */
export interface GraphSettings {
  search: string;
  showTags: boolean;
  showAttachments: boolean;
  hideUnresolved: boolean;
  showOrphans: boolean;
  colorGroups: { query: string; color: { a: number; rgb: number } }[];
  showArrow: boolean;
  textFadeMultiplier: number;
  nodeSizeMultiplier: number;
  lineSizeMultiplier: number;
  centerStrength: number;
  repelStrength: number;
  linkStrength: number;
  linkDistance: number;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  search: "",
  showTags: false,
  showAttachments: false,
  hideUnresolved: false,
  showOrphans: true,
  colorGroups: [],
  showArrow: false,
  textFadeMultiplier: 0,
  nodeSizeMultiplier: 1,
  lineSizeMultiplier: 1,
  centerStrength: 0.518713248970312,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250,
};

export type GraphNodeType = "file" | "unresolved" | "tag" | "attachment";

export interface GraphNode {
  /** Dateipfad, Linktext (nicht aufgelöst) oder `#tag` */
  id: string;
  label: string;
  type: GraphNodeType;
  /** Anzahl der Kanten, bestimmt die Größe */
  weight: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Festgehalten (beim Ziehen) */
  fixed: boolean;
}

export interface GraphLink {
  source: number;
  target: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Was der Graph aus Vault und MetadataCache braucht. */
export interface GraphSource {
  files: { path: string; basename: string; extension: string }[];
  resolvedLinks: Record<string, Record<string, number>>;
  unresolvedLinks: Record<string, Record<string, number>>;
  tags(path: string): string[];
}

export interface GraphFilter {
  showTags: boolean;
  showAttachments: boolean;
  hideUnresolved: boolean;
  showOrphans: boolean;
  /** Nur diese Notizen (Ergebnis der Suche); `null` = alle */
  include?: Set<string> | null;
}

/** Lokaler Graph: Umgebung einer Notiz bis zur Tiefe `depth`. */
export interface LocalGraphOptions {
  depth: number;
  incoming: boolean;
  outgoing: boolean;
  /** Links zwischen den Nachbarn selbst */
  neighbors: boolean;
}

class Builder {
  nodes: GraphNode[] = [];
  links: GraphLink[] = [];
  private index = new Map<string, number>();
  private seen = new Set<string>();

  node(id: string, label: string, type: GraphNodeType): number {
    let i = this.index.get(id);
    if (i === undefined) {
      i = this.nodes.length;
      this.index.set(id, i);
      this.nodes.push({ id, label, type, weight: 0, x: 0, y: 0, vx: 0, vy: 0, fixed: false });
    }
    return i;
  }

  link(a: number, b: number) {
    if (a === b) return;
    const key = `${a}>${b}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.links.push({ source: a, target: b });
    this.nodes[a].weight++;
    this.nodes[b].weight++;
  }
}

/** Gerichtete Kanten des ganzen Vaults (Quelle → Ziel) als Paare von Knoten-IDs. */
function allEdges(source: GraphSource, filter: Omit<GraphFilter, "include" | "showOrphans">) {
  const fileByPath = new Map(source.files.map((f) => [f.path, f]));
  const isNote = (path: string) => fileByPath.get(path)?.extension === "md";
  const edges: [string, string][] = [];
  for (const [from, targets] of Object.entries(source.resolvedLinks)) {
    for (const to of Object.keys(targets)) {
      if (!isNote(to) && !filter.showAttachments) continue;
      edges.push([from, to]);
    }
  }
  if (!filter.hideUnresolved) {
    for (const [from, targets] of Object.entries(source.unresolvedLinks)) {
      for (const link of Object.keys(targets)) edges.push([from, `unresolved:${link}`]);
    }
  }
  if (filter.showTags) {
    for (const file of source.files) {
      if (file.extension !== "md") continue;
      for (const tag of new Set(source.tags(file.path))) edges.push([file.path, tag]);
    }
  }
  return edges;
}

function describe(id: string, fileByPath: Map<string, { basename: string; extension: string }>) {
  if (id.startsWith("unresolved:")) return { label: id.slice("unresolved:".length), type: "unresolved" as const };
  if (id.startsWith("#")) return { label: id, type: "tag" as const };
  const file = fileByPath.get(id);
  const ext = file?.extension ?? "";
  return {
    label: ext === "md" ? (file?.basename ?? id) : (id.split("/").pop() ?? id),
    type: ext === "md" ? ("file" as const) : ("attachment" as const),
  };
}

/** Globaler Graph wie Obsidians Graph-Ansicht. */
export function buildGraph(source: GraphSource, filter: GraphFilter): GraphData {
  const fileByPath = new Map(source.files.map((f) => [f.path, f]));
  const include = filter.include ?? null;
  // Die Suche filtert Notizen; Tags und nicht aufgelöste Links hängen an den übrigen Notizen.
  const visible = (id: string) => {
    if (!include) return true;
    const file = fileByPath.get(id);
    return !file || file.extension !== "md" || include.has(id);
  };
  const b = new Builder();
  const add = (id: string) => {
    const { label, type } = describe(id, fileByPath);
    return b.node(id, label, type);
  };
  for (const file of source.files) {
    if (file.extension !== "md" && !filter.showAttachments) continue;
    if (visible(file.path)) add(file.path);
  }
  for (const [from, to] of allEdges(source, filter)) {
    if (!visible(from) || !visible(to)) continue;
    b.link(add(from), add(to));
  }
  if (filter.showOrphans) return { nodes: b.nodes, links: b.links };
  return dropOrphans(b);
}

function dropOrphans({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }): GraphData {
  const map = new Map<number, number>();
  const kept: GraphNode[] = [];
  nodes.forEach((n, i) => {
    if (n.weight === 0) return;
    map.set(i, kept.length);
    kept.push(n);
  });
  return { nodes: kept, links: links.map((l) => ({ source: map.get(l.source)!, target: map.get(l.target)! })) };
}

/** Lokaler Graph um `center` (Pfad), wie Obsidians „Lokaler Graph“. */
export function buildLocalGraph(source: GraphSource, center: string, options: LocalGraphOptions, filter: Omit<GraphFilter, "include" | "showOrphans">): GraphData {
  const fileByPath = new Map(source.files.map((f) => [f.path, f]));
  const edges = allEdges(source, filter);
  const out = new Map<string, string[]>();
  const inc = new Map<string, string[]>();
  for (const [from, to] of edges) {
    (out.get(from) ?? out.set(from, []).get(from)!).push(to);
    (inc.get(to) ?? inc.set(to, []).get(to)!).push(from);
  }
  // Breitensuche: welche Knoten liegen höchstens `depth` Schritte entfernt?
  const level = new Map<string, number>([[center, 0]]);
  let frontier = [center];
  for (let d = 1; d <= options.depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const around = [...(options.outgoing ? (out.get(id) ?? []) : []), ...(options.incoming ? (inc.get(id) ?? []) : [])];
      for (const other of around) {
        if (level.has(other)) continue;
        level.set(other, d);
        next.push(other);
      }
    }
    frontier = next;
  }

  const b = new Builder();
  const add = (id: string) => {
    const { label, type } = describe(id, fileByPath);
    return b.node(id, label, type);
  };
  add(center);
  for (const [from, to] of edges) {
    const lf = level.get(from);
    const lt = level.get(to);
    if (lf === undefined || lt === undefined) continue;
    // Kante auf dem Weg vom Zentrum nach außen, oder zwischen Nachbarn, wenn gewünscht.
    const onPath = (lt === lf + 1 && options.outgoing) || (lf === lt + 1 && options.incoming);
    if (!onPath && !options.neighbors) continue;
    b.link(add(from), add(to));
  }
  return { nodes: b.nodes, links: b.links };
}

// --- Kräftesimulation --------------------------------------------------------------------------

export interface ForceSettings {
  centerStrength: number;
  repelStrength: number;
  linkStrength: number;
  linkDistance: number;
}

const ALPHA_MIN = 0.005;
const ALPHA_DECAY = 1 - Math.pow(ALPHA_MIN, 1 / 300);
const VELOCITY_DECAY = 0.4;
const THETA2 = 0.81;

interface Quad {
  x0: number;
  y0: number;
  size: number;
  mass: number;
  cx: number;
  cy: number;
  /** Einzelner Knoten (Blatt) oder Kinder */
  node: GraphNode | null;
  children: (Quad | null)[] | null;
}

function newQuad(x0: number, y0: number, size: number): Quad {
  return { x0, y0, size, mass: 0, cx: 0, cy: 0, node: null, children: null };
}

function insert(q: Quad, n: GraphNode, depth = 0): void {
  if (!q.children && !q.node && q.mass === 0) {
    q.node = n;
    q.mass = 1;
    q.cx = n.x;
    q.cy = n.y;
    return;
  }
  if (!q.children) {
    q.children = [null, null, null, null];
    const prev = q.node;
    q.node = null;
    // Gleiche Position: nicht endlos teilen, sondern leicht versetzen.
    if (prev && depth < 40) insertChild(q, prev, depth);
    else if (prev) prev.x += 1e-3;
  }
  q.cx = (q.cx * q.mass + n.x) / (q.mass + 1);
  q.cy = (q.cy * q.mass + n.y) / (q.mass + 1);
  q.mass++;
  if (depth < 40) insertChild(q, n, depth);
}

function insertChild(q: Quad, n: GraphNode, depth: number) {
  const half = q.size / 2;
  const right = n.x >= q.x0 + half ? 1 : 0;
  const bottom = n.y >= q.y0 + half ? 1 : 0;
  const i = right + bottom * 2;
  const children = q.children!;
  children[i] ??= newQuad(q.x0 + right * half, q.y0 + bottom * half, half);
  insert(children[i]!, n, depth + 1);
}

/** Kräftebasiertes Layout ähnlich d3-force; `tick` ist billig genug für jeden Frame. */
export class ForceSimulation {
  alpha = 1;
  private degree: number[] = [];

  constructor(
    public data: GraphData,
    public forces: ForceSettings,
  ) {
    this.setData(data);
  }

  /** Neue Daten; vorhandene Positionen (gleiche IDs) bleiben erhalten. */
  setData(data: GraphData, previous?: GraphData): void {
    const old = new Map((previous?.nodes ?? []).map((n) => [n.id, n]));
    data.nodes.forEach((n, i) => {
      const prev = old.get(n.id);
      if (prev) {
        n.x = prev.x;
        n.y = prev.y;
        n.vx = prev.vx;
        n.vy = prev.vy;
        return;
      }
      if (n.x || n.y) return;
      // Spirale (Phyllotaxis) wie d3: gleichmäßige Startverteilung ohne Zufall.
      const r = 10 * Math.sqrt(0.5 + i);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      n.x = r * Math.cos(a);
      n.y = r * Math.sin(a);
    });
    this.degree = new Array(data.nodes.length).fill(0);
    for (const l of data.links) {
      this.degree[l.source]++;
      this.degree[l.target]++;
    }
    this.data = data;
  }

  reheat(alpha = 0.3): void {
    this.alpha = Math.max(this.alpha, alpha);
  }

  isRunning(): boolean {
    return this.alpha > ALPHA_MIN;
  }

  tick(): void {
    const { nodes, links } = this.data;
    const { centerStrength, repelStrength, linkStrength, linkDistance } = this.forces;
    const alpha = this.alpha;
    if (!nodes.length) return;

    // Federn entlang der Links (d3: Stärke 1/min(Grad) verhindert, dass Hubs alles zerren).
    for (const l of links) {
      const s = nodes[l.source];
      const t = nodes[l.target];
      let dx = t.x + t.vx - (s.x + s.vx) || 1e-6;
      let dy = t.y + t.vy - (s.y + s.vy) || 1e-6;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const strength = linkStrength / Math.min(this.degree[l.source], this.degree[l.target]);
      const k = ((dist - linkDistance) / dist) * alpha * strength;
      dx *= k;
      dy *= k;
      const ds = this.degree[l.source];
      const dt = this.degree[l.target];
      const bias = ds / (ds + dt);
      t.vx -= dx * bias;
      t.vy -= dy * bias;
      s.vx += dx * (1 - bias);
      s.vy += dy * (1 - bias);
    }

    // Abstoßung (Barnes-Hut).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    const root = newQuad(minX, minY, Math.max(maxX - minX, maxY - minY, 1) + 1);
    for (const n of nodes) insert(root, n);
    const charge = repelStrength * 20 * alpha;
    for (const n of nodes) this.repel(root, n, charge);

    // Zug zur Mitte, damit unverbundene Teile nicht davontreiben.
    const center = centerStrength * 0.2 * alpha;
    for (const n of nodes) {
      n.vx -= n.x * center;
      n.vy -= n.y * center;
    }

    for (const n of nodes) {
      if (n.fixed) {
        n.vx = n.vy = 0;
        continue;
      }
      n.vx *= 1 - VELOCITY_DECAY;
      n.vy *= 1 - VELOCITY_DECAY;
      n.x += n.vx;
      n.y += n.vy;
    }
    this.alpha += (0 - this.alpha) * ALPHA_DECAY;
  }

  private repel(q: Quad, n: GraphNode, charge: number) {
    if (q.node === n && !q.children) return;
    const dx = q.cx - n.x;
    const dy = q.cy - n.y;
    let d2 = dx * dx + dy * dy;
    if (q.children && (q.size * q.size) / (d2 || 1e-9) >= THETA2) {
      for (const c of q.children) if (c) this.repel(c, n, charge);
      return;
    }
    if (q.node === n) return;
    if (d2 < 1) d2 = 1;
    // Nahe Knoten nicht unendlich stark abstoßen; weit entfernte kaum.
    const k = (charge * q.mass) / d2;
    n.vx -= dx * k;
    n.vy -= dy * k;
  }
}

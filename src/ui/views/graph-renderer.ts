import { ForceSimulation, type ForceSettings, type GraphData, type GraphNode } from "../../core/graph";

export interface GraphDisplay {
  showArrow: boolean;
  textFadeMultiplier: number;
  nodeSizeMultiplier: number;
  lineSizeMultiplier: number;
}

export interface GraphRendererOptions {
  /** Klick auf einen Knoten; `newLeaf` bei Cmd/Strg-Klick oder Mittelklick. */
  onOpen(node: GraphNode, newLeaf: boolean): void;
}

/** Farben kommen wie in Obsidian aus versteckten Elementen mit `.graph-view.color-*`, damit Themes greifen. */
const COLOR_CLASSES = {
  fill: "color-fill",
  fillFocused: "color-fill-focused",
  fillTag: "color-fill-tag",
  fillAttachment: "color-fill-attachment",
  fillUnresolved: "color-fill-unresolved",
  fillHighlight: "color-fill-highlight",
  line: "color-line",
  lineHighlight: "color-line-highlight",
  text: "color-text",
  arrow: "color-arrow",
} as const;

type Colors = Record<keyof typeof COLOR_CLASSES, string>;

const MIN_SCALE = 0.02;
const MAX_SCALE = 8;

/**
 * Zeichnet einen Graphen auf ein Canvas und hält die Kräftesimulation am Laufen. Bedienung wie in
 * Obsidian: Ziehen verschiebt, Mausrad zoomt, Knoten lassen sich ziehen, Klick öffnet die Notiz.
 */
export class GraphRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly simulation: ForceSimulation;
  display: GraphDisplay = { showArrow: false, textFadeMultiplier: 0, nodeSizeMultiplier: 1, lineSizeMultiplier: 1 };
  /** Hervorgehobener Knoten (aktive Notiz im lokalen Graphen) */
  focusedId: string | null = null;
  /** Farbe aus Farbgruppen; `null` = Standardfarbe */
  nodeColor: (node: GraphNode) => string | null = () => null;

  private ctx: CanvasRenderingContext2D;
  private colorProbeEl: HTMLElement;
  private colors!: Colors;
  private width = 0;
  private height = 0;
  private scale = 1;
  private panX = 0;
  private panY = 0;
  /** Bis zum ersten Verschieben/Zoomen passt sich die Ansicht dem Graphen an. */
  private autoFit = true;
  private hovered: GraphNode | null = null;
  private neighbors = new Set<GraphNode>();
  private adjacency: number[][] = [];
  private frame = 0;
  private dirty = true;
  private resizeObserver: ResizeObserver;
  private themeObserver: MutationObserver;

  constructor(
    private containerEl: HTMLElement,
    forces: ForceSettings,
    private options: GraphRendererOptions,
  ) {
    this.canvas = containerEl.createEl("canvas", { cls: "graph-canvas" });
    this.ctx = this.canvas.getContext("2d")!;
    this.colorProbeEl = containerEl.createDiv("graph-color-probes");
    for (const cls of Object.values(COLOR_CLASSES)) this.colorProbeEl.createDiv(`graph-view ${cls}`);
    this.readColors();
    this.simulation = new ForceSimulation({ nodes: [], links: [] }, { ...forces });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(containerEl);
    // Theme-Wechsel (Klassen an body) → Farben neu lesen.
    this.themeObserver = new MutationObserver(() => {
      this.readColors();
      this.requestDraw();
    });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    this.bindInput();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resizeObserver.disconnect();
    this.themeObserver.disconnect();
    this.canvas.detach();
    this.colorProbeEl.detach();
  }

  /** Angezeigte Knoten mit ihrer aktuellen Position */
  get nodes(): readonly GraphNode[] {
    return this.simulation.data.nodes;
  }

  setData(data: GraphData): void {
    const previous = this.simulation.data;
    this.simulation.setData(data, previous);
    this.adjacency = data.nodes.map(() => []);
    for (const l of data.links) {
      this.adjacency[l.source].push(l.target);
      this.adjacency[l.target].push(l.source);
    }
    if (this.hovered && !data.nodes.includes(this.hovered)) this.setHovered(null);
    const changed = previous.nodes.length !== data.nodes.length || previous.links.length !== data.links.length;
    if (changed) this.simulation.reheat(previous.nodes.length ? 0.5 : 1);
    this.requestDraw();
  }

  setForces(forces: ForceSettings): void {
    Object.assign(this.simulation.forces, forces);
    this.simulation.reheat(0.5);
    this.requestDraw();
  }

  /** Simulation neu starten und Ansicht wieder einpassen. */
  restart(): void {
    for (const n of this.simulation.data.nodes) {
      n.x = n.y = n.vx = n.vy = 0;
      n.fixed = false;
    }
    this.simulation.setData(this.simulation.data);
    this.simulation.alpha = 1;
    this.autoFit = true;
    this.requestDraw();
  }

  requestDraw(): void {
    this.dirty = true;
    if (!this.frame) this.frame = requestAnimationFrame(() => this.loop());
  }

  private loop() {
    this.frame = 0;
    if (!this.width || !this.height) return; // verborgen: beim nächsten Resize weiter
    const running = this.simulation.isRunning();
    if (running) this.simulation.tick();
    if (running && this.autoFit) this.fit();
    if (running || this.dirty) this.draw();
    this.dirty = false;
    if (this.simulation.isRunning()) this.frame = requestAnimationFrame(() => this.loop());
  }

  private resize() {
    const rect = this.containerEl.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    if (this.autoFit) this.fit();
    this.requestDraw();
  }

  private readColors() {
    const probes = Array.from(this.colorProbeEl.children) as HTMLElement[];
    const keys = Object.keys(COLOR_CLASSES) as (keyof typeof COLOR_CLASSES)[];
    this.colors = Object.fromEntries(keys.map((key, i) => [key, getComputedStyle(probes[i]).color || "#888"])) as Colors;
  }

  private radius(node: GraphNode) {
    return (6 + Math.sqrt(node.weight) * 3) * this.display.nodeSizeMultiplier;
  }

  /** Ansicht so skalieren und verschieben, dass alle Knoten sichtbar sind. */
  private fit() {
    const nodes = this.simulation.data.nodes;
    if (!nodes.length || !this.width) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const r = this.radius(n);
      minX = Math.min(minX, n.x - r);
      minY = Math.min(minY, n.y - r);
      maxX = Math.max(maxX, n.x + r);
      maxY = Math.max(maxY, n.y + r);
    }
    const pad = 40;
    const scale = Math.min((this.width - pad) / (maxX - minX || 1), (this.height - pad) / (maxY - minY || 1), 1.5);
    this.scale = Math.max(MIN_SCALE, scale);
    this.panX = -((minX + maxX) / 2) * this.scale;
    this.panY = -((minY + maxY) / 2) * this.scale;
  }

  /** Weltkoordinaten → Pixel relativ zum Canvas */
  toScreen(x: number, y: number): [number, number] {
    return [x * this.scale + this.panX + this.width / 2, y * this.scale + this.panY + this.height / 2];
  }

  private toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.width / 2 - this.panX) / this.scale, (sy - this.height / 2 - this.panY) / this.scale];
  }

  private nodeAt(sx: number, sy: number): GraphNode | null {
    const [x, y] = this.toWorld(sx, sy);
    const nodes = this.simulation.data.nodes;
    // Von oben nach unten (zuletzt gezeichnet = oben); etwas Toleranz für kleine Knoten.
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const r = Math.max(this.radius(n), 4 / this.scale);
      if ((n.x - x) ** 2 + (n.y - y) ** 2 <= r * r) return n;
    }
    return null;
  }

  private setHovered(node: GraphNode | null) {
    if (node === this.hovered) return;
    this.hovered = node;
    this.neighbors.clear();
    if (node) {
      const nodes = this.simulation.data.nodes;
      for (const i of this.adjacency[nodes.indexOf(node)] ?? []) this.neighbors.add(nodes[i]);
    }
    this.canvas.toggleClass("is-hovering", !!node);
    this.requestDraw();
  }

  private bindInput() {
    const canvas = this.canvas;
    let drag: { node: GraphNode | null; x: number; y: number; moved: boolean; button: number } | null = null;
    const local = (evt: MouseEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [evt.clientX - rect.left, evt.clientY - rect.top];
    };

    canvas.addEventListener("pointerdown", (evt) => {
      if (evt.button !== 0 && evt.button !== 1) return;
      const [x, y] = local(evt);
      const node = this.nodeAt(x, y);
      drag = { node, x, y, moved: false, button: evt.button };
      canvas.setPointerCapture(evt.pointerId);
      if (evt.button === 1) evt.preventDefault();
    });
    canvas.addEventListener("pointermove", (evt) => {
      const [x, y] = local(evt);
      if (!drag) {
        this.setHovered(this.nodeAt(x, y));
        return;
      }
      if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) < 3) return;
      drag.moved = true;
      if (drag.node) {
        const [wx, wy] = this.toWorld(x, y);
        drag.node.x = wx;
        drag.node.y = wy;
        drag.node.fixed = true;
        this.simulation.reheat(0.3);
      } else {
        this.panX += x - drag.x;
        this.panY += y - drag.y;
        drag.x = x;
        drag.y = y;
        this.autoFit = false;
      }
      this.requestDraw();
    });
    canvas.addEventListener("pointerup", (evt) => {
      if (!drag) return;
      const { node, moved, button } = drag;
      drag = null;
      if (node) node.fixed = false;
      if (node && !moved) this.options.onOpen(node, button === 1 || evt.metaKey || evt.ctrlKey);
    });
    canvas.addEventListener("pointerleave", () => !drag && this.setHovered(null));
    canvas.addEventListener(
      "wheel",
      (evt) => {
        evt.preventDefault();
        const [x, y] = local(evt);
        const [wx, wy] = this.toWorld(x, y);
        const factor = Math.exp(-evt.deltaY * (evt.ctrlKey ? 0.01 : 0.002));
        this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
        // Punkt unter dem Mauszeiger bleibt stehen.
        this.panX = x - this.width / 2 - wx * this.scale;
        this.panY = y - this.height / 2 - wy * this.scale;
        this.autoFit = false;
        this.requestDraw();
      },
      { passive: false },
    );
  }

  private draw() {
    const { ctx, colors, display } = this;
    const { nodes, links } = this.simulation.data;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const hovered = this.hovered;
    const isLit = (n: GraphNode) => !hovered || n === hovered || this.neighbors.has(n);

    // Kanten
    ctx.lineWidth = Math.max(0.5, display.lineSizeMultiplier * Math.min(1.5, this.scale * 1.2));
    for (const pass of hovered ? [false, true] : [false]) {
      ctx.strokeStyle = pass ? colors.lineHighlight : colors.line;
      ctx.globalAlpha = hovered && !pass ? 0.2 : 1;
      ctx.beginPath();
      for (const l of links) {
        const s = nodes[l.source];
        const t = nodes[l.target];
        const lit = hovered !== null && (s === hovered || t === hovered);
        if (lit !== pass) continue;
        const [x1, y1] = this.toScreen(s.x, s.y);
        const [x2, y2] = this.toScreen(t.x, t.y);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }

    if (display.showArrow && this.scale > 0.3) {
      ctx.fillStyle = colors.arrow;
      for (const l of links) {
        const s = nodes[l.source];
        const t = nodes[l.target];
        ctx.globalAlpha = isLit(s) && isLit(t) ? 1 : 0.2;
        this.drawArrow(s, t);
      }
    }

    // Knoten
    for (const n of nodes) {
      const [x, y] = this.toScreen(n.x, n.y);
      const r = Math.max(1.5, this.radius(n) * this.scale);
      if (x < -r || y < -r || x > this.width + r || y > this.height + r) continue;
      ctx.globalAlpha = isLit(n) ? 1 : 0.25;
      ctx.fillStyle = this.fillFor(n);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (n.id === this.focusedId) {
        ctx.strokeStyle = colors.fillFocused;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Beschriftungen: blenden beim Herauszoomen aus; die Umgebung des Hover-Knotens bleibt lesbar.
    const fadeStart = 0.3 * Math.pow(1.6, display.textFadeMultiplier);
    const zoomAlpha = Math.min(1, Math.max(0, (this.scale - fadeStart) / (fadeStart * 0.6)));
    const fontSize = Math.max(10, Math.min(16, 13 * Math.sqrt(this.scale)));
    ctx.font = `${fontSize}px ${getComputedStyle(this.containerEl).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = colors.text;
    for (const n of nodes) {
      const lit = hovered !== null && isLit(n);
      const alpha = lit ? 1 : hovered ? zoomAlpha * 0.3 : n.id === this.focusedId ? Math.max(zoomAlpha, 0.8) : zoomAlpha;
      if (alpha <= 0.02) continue;
      const [x, y] = this.toScreen(n.x, n.y);
      const r = Math.max(1.5, this.radius(n) * this.scale);
      if (x < -200 || y < -50 || x > this.width + 200 || y > this.height + 50) continue;
      ctx.globalAlpha = alpha;
      ctx.fillText(n.label, x, y + r + 4);
    }
    ctx.globalAlpha = 1;
  }

  private fillFor(n: GraphNode): string {
    const { colors } = this;
    if (n === this.hovered) return colors.fillHighlight;
    const custom = n.type === "file" ? this.nodeColor(n) : null;
    if (custom) return custom;
    if (n.id === this.focusedId) return colors.fillFocused;
    switch (n.type) {
      case "tag":
        return colors.fillTag;
      case "attachment":
        return colors.fillAttachment;
      case "unresolved":
        return colors.fillUnresolved;
      default:
        return colors.fill;
    }
  }

  private drawArrow(s: GraphNode, t: GraphNode) {
    const [x1, y1] = this.toScreen(s.x, s.y);
    const [x2, y2] = this.toScreen(t.x, t.y);
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const r = Math.max(1.5, this.radius(t) * this.scale);
    const tipX = x2 - ux * r;
    const tipY = y2 - uy * r;
    const size = Math.max(4, 6 * Math.min(1.5, this.scale));
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - ux * size - uy * size * 0.5, tipY - uy * size + ux * size * 0.5);
    ctx.lineTo(tipX - ux * size + uy * size * 0.5, tipY - uy * size - ux * size * 0.5);
    ctx.closePath();
    ctx.fill();
  }
}

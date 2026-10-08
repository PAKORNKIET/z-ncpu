// วาดวงจรด้วย Canvas 2D (Spec ส่วน 14) — ซ่อนอยู่หลัง CircuitRenderer เปลี่ยนเป็น WebGL ภายหลังได้

import type { Bit, SignalValue } from '@z-ncpu/shared';
import { GRID, type Camera, type Point } from './geometry';
import type { Overlay } from './interaction';
import { pinKey, type Scene, type SceneNode } from './scene';
import { wireStyle } from './style';

export interface Frame {
  scene: Scene;
  camera: Camera;
  /** ค่าของขา key = "ชื่อชิ้น.ชื่อขา" (จาก Simulator.readScope) ไม่มีค่า = ยังไม่ได้จำลอง */
  values: Readonly<Record<string, SignalValue>>;
  selection: { instances: readonly string[]; wires: readonly string[] };
  overlay: Overlay;
  /** ชิ้นเงาตอนกำลังวาง */
  ghost?: SceneNode;
  /** อ่านสีจาก CSS variable เช่น "--signal-high" */
  color: (cssVar: string) => string;
}

export interface CircuitRenderer {
  render(frame: Frame): void;
  /** ขนาดเป็น CSS px และ devicePixelRatio */
  resize(width: number, height: number, dpr: number): void;
  destroy(): void;
}

const FONT = '"Noto Sans Thai", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export const toBit = (v: SignalValue | undefined): Bit => (v === undefined || v === 'X' ? 2 : v === 0 ? 0 : 1);

export class Canvas2DRenderer implements CircuitRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้วาด Canvas 2D ไม่ได้');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
  }

  destroy(): void {
    this.ctx.reset?.();
  }

  render(f: Frame): void {
    const { ctx } = this;
    const { camera: cam } = f;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = f.color('--bg');
    ctx.fillRect(0, 0, this.width, this.height);

    // จากนี้วาดเป็นพิกัดโลก
    ctx.setTransform(this.dpr * cam.zoom, 0, 0, this.dpr * cam.zoom, -cam.x * cam.zoom * this.dpr, -cam.y * cam.zoom * this.dpr);
    this.grid(f);

    const selectedWires = new Set(f.selection.wires);
    for (const w of f.scene.wires) {
      const value = f.values[pinKey(w.from)];
      const style = wireStyle(toBit(value), w.width);
      if (selectedWires.has(w.id)) this.polyline(w.points, f.color('--accent'), style.width + 5, [], 0.45);
      this.polyline(w.points, f.color(style.colorVar), style.width, style.dash);
      if (w.width > 1 && value !== undefined) this.busLabel(w.points, value, f);
    }

    const selected = new Set(f.selection.instances);
    const dragging = new Set(f.overlay.dragging ?? []);
    const targets = new Set((f.overlay.targets ?? []).map(pinKey));
    const hover = f.overlay.hoverPin ? pinKey(f.overlay.hoverPin) : undefined;
    for (const n of f.scene.nodes) this.node(n, f, selected.has(n.id), targets, hover, dragging.has(n.id));

    const g = f.overlay.ghostWire;
    if (g) {
      const mid = (g.from.x + g.to.x) / 2;
      this.polyline(
        [g.from, { x: mid, y: g.from.y }, { x: mid, y: g.to.y }, g.to],
        f.color(g.valid ? '--accent' : '--error'),
        2,
        [6, 4],
      );
    }
    if (f.ghost) {
      ctx.globalAlpha = 0.5;
      this.node(f.ghost, f, false, new Set(), undefined);
      ctx.globalAlpha = 1;
    }
    const mq = f.overlay.marquee;
    if (mq) {
      ctx.fillStyle = f.color('--accent');
      ctx.globalAlpha = 0.12;
      ctx.fillRect(mq.x, mq.y, mq.w, mq.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = f.color('--accent');
      ctx.lineWidth = 1 / cam.zoom;
      ctx.setLineDash([4 / cam.zoom, 3 / cam.zoom]);
      ctx.strokeRect(mq.x, mq.y, mq.w, mq.h);
      ctx.setLineDash([]);
    }
  }

  private grid(f: Frame): void {
    const { ctx } = this;
    const cam = f.camera;
    if (cam.zoom < 0.4) return;
    const step = cam.zoom < 0.8 ? GRID * 2 : GRID;
    const x0 = Math.floor(cam.x / step) * step;
    const y0 = Math.floor(cam.y / step) * step;
    const x1 = cam.x + this.width / cam.zoom;
    const y1 = cam.y + this.height / cam.zoom;
    const r = 1 / cam.zoom;
    ctx.fillStyle = f.color('--border');
    for (let x = x0; x <= x1; x += step) for (let y = y0; y <= y1; y += step) ctx.fillRect(x - r / 2, y - r / 2, r * 1.5, r * 1.5);
  }

  private polyline(points: readonly Point[], color: string, width: number, dash: number[], alpha = 1): void {
    const { ctx } = this;
    if (points.length < 2) return;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  private busLabel(points: readonly Point[], value: SignalValue, f: Frame): void {
    const { ctx } = this;
    const a = points[Math.floor((points.length - 1) / 2)]!;
    const b = points[Math.floor((points.length - 1) / 2) + 1] ?? a;
    const text = value === 'X' ? 'X' : String(value);
    ctx.font = `600 11px ${MONO}`;
    const w = ctx.measureText(text).width + 8;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    ctx.fillStyle = f.color('--surface');
    ctx.fillRect(cx - w / 2, cy - 8, w, 16);
    ctx.fillStyle = f.color('--text');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
  }

  private node(n: SceneNode, f: Frame, selected: boolean, targets: Set<string>, hover: string | undefined, dragging = false): void {
    const { ctx } = this;
    const r = n.rect;
    const terminal = n.kind !== 'instance';
    const value = terminal && n.pins[0] ? f.values[pinKey(n.pins[0].ref)] : undefined;
    const bit = toBit(value);

    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, terminal ? r.h / 2 : 6);
    ctx.fillStyle = terminal && bit === 1 ? f.color('--signal-high') : f.color('--surface');
    ctx.fill();
    ctx.lineWidth = dragging ? 3 : selected ? 2.5 : 1.5;
    ctx.strokeStyle = n.broken ? f.color('--error') : dragging ? f.color('--signal-high') : selected ? f.color('--accent') : f.color('--border');
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (terminal) {
      // ขาของวงจร: ชื่อ = ค่า (ไม่บอกค่าด้วยสีอย่างเดียว, Spec ส่วน 16)
      const shown = value === undefined ? '' : ` = ${value === 'X' ? 'X' : value}`;
      ctx.font = `600 13px ${MONO}`;
      ctx.fillStyle = bit === 1 ? f.color('--bg') : f.color('--text');
      ctx.fillText(`${n.title}${shown}`, r.x + r.w / 2, r.y + r.h / 2);
      ctx.font = `11px ${FONT}`;
      ctx.fillStyle = f.color('--muted');
      ctx.fillText(n.kind === 'input' ? 'ขาเข้า' : 'ขาออก', r.x + r.w / 2, r.y - 9);
    } else {
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = f.color('--text');
      ctx.fillText(n.title, r.x + r.w / 2, r.y + r.h / 2);
      if (n.label) {
        ctx.font = `11px ${FONT}`;
        ctx.fillStyle = f.color('--muted');
        ctx.fillText(n.label, r.x + r.w / 2, r.y - 9);
      }
    }

    for (const p of n.pins) {
      const key = pinKey(p.ref);
      const pv = toBit(f.values[key]);
      const isHover = key === hover;
      const isTarget = targets.has(key);
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, isHover ? 6 : p.width > 1 ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = pv === 1 ? f.color('--signal-high') : pv === 0 ? f.color('--signal-low') : f.color('--signal-unknown');
      ctx.fill();
      if (isHover || isTarget) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = f.color('--accent');
        ctx.stroke();
      }
      if (!terminal && n.pins.length > 3 && f.camera.zoom >= 0.8) {
        // ชื่อขาเล็กๆ ข้างในกล่อง (เฉพาะชิ้นที่มีหลายขา เกตเล็กๆ ดูรูปก็รู้)
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = f.color('--muted');
        const inward = { x: p.pos.x - p.normal.x * 10, y: p.pos.y - p.normal.y * 10 };
        ctx.textAlign = p.normal.x > 0 ? 'right' : p.normal.x < 0 ? 'left' : 'center';
        ctx.fillText(p.ref.pin, inward.x, inward.y);
        ctx.textAlign = 'center';
      }
    }
  }
}

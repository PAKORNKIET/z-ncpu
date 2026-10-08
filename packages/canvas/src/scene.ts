// Scene = ComponentDef ที่คำนวณตำแหน่งบนจอไว้แล้ว ใช้ทั้งวาดและหาว่าเมาส์ชี้อะไรอยู่ (Spec ส่วน 14)

import type { ComponentDef, PinRef, Rotation } from '@z-ncpu/shared';
import { distToSegment, GRID, nodeShape, PIN_PITCH, rotate, rotatedSize, type Point, type Rect } from './geometry';
import type { PinResolver } from './editor/ops';

export type NodeKind = 'instance' | 'input' | 'output';

export interface ScenePin {
  ref: PinRef;
  /** source = ขาออกของชิ้น หรือขาเข้าของวงจรนี้ (ปล่อยสัญญาณออกไปตามสาย) */
  role: 'source' | 'sink';
  width: number;
  pos: Point;
  /** ทิศที่สายวิ่งออกจากขา (เวกเตอร์หนึ่งหน่วย) */
  normal: Point;
}

export interface SceneNode {
  /** id ของ instance หรือ "self.<ชื่อขา>" สำหรับขาของวงจรเอง */
  id: string;
  kind: NodeKind;
  defId?: string;
  /** ข้อความบนกล่อง เช่น NAND */
  title: string;
  label?: string;
  center: Point;
  rect: Rect;
  rotation: Rotation;
  pins: ScenePin[];
  /** ความกว้างบิตของขา สำหรับขาของวงจรเอง */
  bits?: number;
  /** ไม่รู้จักชิ้นส่วนนี้ หรือ params ผิด */
  broken?: boolean;
}

export interface SceneWire {
  id: string;
  from: PinRef;
  to: PinRef;
  points: Point[];
  width: number;
}

export interface Scene {
  nodes: SceneNode[];
  wires: SceneWire[];
  pins: Map<string, ScenePin>;
  bounds: Rect;
}

export const pinKey = (ref: PinRef): string => `${ref.inst}.${ref.pin}`;

/** ระยะแนวนอนระหว่างคอลัมน์ขาเข้ากับขาออกของวงจร */
export const TERMINAL_SPAN = GRID * 30;
const TERMINAL_ROW = PIN_PITCH * 2;

/** ตำแหน่งกลางของขาวงจรเอง: ขาเข้าเรียงซ้าย ขาออกเรียงขวา จัดกึ่งกลางแนวตั้งที่ y = 0 */
export function terminalCenter(dir: 'in' | 'out', index: number, count: number): Point {
  return { x: dir === 'in' ? 0 : TERMINAL_SPAN, y: (index - (count - 1) / 2) * TERMINAL_ROW };
}

export interface SceneOptions {
  pinsOf: PinResolver;
  /** ชื่อที่แสดงบนกล่อง เช่น prim.nand → NAND */
  titleOf?: (defId: string) => string;
}

export function defaultTitle(defId: string): string {
  const stem = defId.split('.').pop() ?? defId;
  const known: Record<string, string> = { const0: '0', const1: '1', clock: 'CLK', split: 'SPLIT', merge: 'MERGE', panel: 'PANEL' };
  return known[stem] ?? stem.toUpperCase();
}

export function buildScene(def: ComponentDef, options: SceneOptions): Scene {
  const titleOf = options.titleOf ?? defaultTitle;
  const nodes: SceneNode[] = [];
  const pins = new Map<string, ScenePin>();

  // ขาของวงจรเอง
  const termShape = { w: GRID * 4, h: GRID * 2 };
  for (const dir of ['in', 'out'] as const) {
    const list = def.pins.filter((p) => p.dir === dir);
    list.forEach((p, i) => {
      const center = def.body?.terminals?.[p.name] ?? terminalCenter(dir, i, list.length);
      const ref = { inst: 'self', pin: p.name };
      const pin: ScenePin = {
        ref,
        role: dir === 'in' ? 'source' : 'sink',
        width: p.width,
        pos: { x: center.x + (dir === 'in' ? termShape.w / 2 : -termShape.w / 2), y: center.y },
        normal: { x: dir === 'in' ? 1 : -1, y: 0 },
      };
      pins.set(pinKey(ref), pin);
      nodes.push({
        id: `self.${p.name}`,
        kind: dir === 'in' ? 'input' : 'output',
        title: p.name,
        center,
        rect: { x: center.x - termShape.w / 2, y: center.y - termShape.h / 2, w: termShape.w, h: termShape.h },
        rotation: 0,
        pins: [pin],
        bits: p.width,
      });
    });
  }

  // ชิ้นส่วน
  for (const inst of def.body?.instances ?? []) {
    let pinDefs;
    try {
      pinDefs = options.pinsOf(inst.defId, inst.params);
    } catch {
      pinDefs = undefined;
    }
    const shape = nodeShape(pinDefs ?? []);
    const size = rotatedSize(shape, inst.rotation);
    const center = { x: inst.x, y: inst.y };
    const nodePins: ScenePin[] = shape.pins.map((p) => {
      const off = rotate({ x: p.dx, y: p.dy }, inst.rotation);
      const ref = { inst: inst.id, pin: p.name };
      const pin: ScenePin = {
        ref,
        role: p.dir === 'out' ? 'source' : 'sink',
        width: p.width,
        pos: { x: center.x + off.x, y: center.y + off.y },
        normal: rotate({ x: p.dir === 'out' ? 1 : -1, y: 0 }, inst.rotation),
      };
      pins.set(pinKey(ref), pin);
      return pin;
    });
    const node: SceneNode = {
      id: inst.id,
      kind: 'instance',
      defId: inst.defId,
      title: pinDefs ? titleOf(inst.defId) : '?',
      center,
      rect: { x: center.x - size.w / 2, y: center.y - size.h / 2, w: size.w, h: size.h },
      rotation: inst.rotation,
      pins: nodePins,
    };
    if (inst.label) node.label = inst.label;
    if (!pinDefs) node.broken = true;
    nodes.push(node);
  }

  const wires: SceneWire[] = [];
  for (const w of def.body?.wires ?? []) {
    const a = pins.get(pinKey(w.from));
    const b = pins.get(pinKey(w.to));
    if (!a || !b) continue;
    const via = w.points?.map(([x, y]) => ({ x, y }));
    wires.push({ id: w.id, from: w.from, to: w.to, points: via ? [a.pos, ...via, b.pos] : route(a, b), width: a.width });
  }

  return { nodes, wires, pins, bounds: boundsOf(nodes) };
}

/**
 * เส้นสายแบบหักมุมฉาก: ออกจากขาตามทิศของขา แล้วเลี้ยวที่กึ่งกลาง
 * ถ้าปลายทางอยู่ "ข้างหลัง" ต้นทาง (เช่นต่อเข้าชิ้นที่อยู่ใต้กัน) ให้อ้อมออกไปก่อน ไม่วิ่งทะลุกล่อง
 */
export function route(a: Pick<ScenePin, 'pos' | 'normal'>, b: Pick<ScenePin, 'pos' | 'normal'>): Point[] {
  const s = a.pos;
  const t = b.pos;
  if (a.normal.y === 0 && b.normal.y === 0) {
    const forward = (t.x - s.x) * a.normal.x;
    if (s.y === t.y && forward > 0) return [s, t];
    if (forward >= GRID * 2) {
      const mx = (s.x + t.x) / 2;
      return [s, { x: mx, y: s.y }, { x: mx, y: t.y }, t];
    }
    // อ้อม: ออกจากต้นทาง GRID หนึ่งช่อง ไปตามแนวกึ่งกลางระหว่างสองขา แล้วเข้าปลายทางจากด้านของมัน
    const sx = s.x + a.normal.x * GRID;
    const tx = t.x + b.normal.x * GRID;
    const my = s.y === t.y ? s.y + GRID * 3 : (s.y + t.y) / 2;
    return [s, { x: sx, y: s.y }, { x: sx, y: my }, { x: tx, y: my }, { x: tx, y: t.y }, t];
  }
  if (s.x === t.x || s.y === t.y) return [s, t];
  if (a.normal.y === 0) {
    const mx = (s.x + t.x) / 2;
    return [s, { x: mx, y: s.y }, { x: mx, y: t.y }, t];
  }
  const my = (s.y + t.y) / 2;
  return [s, { x: s.x, y: my }, { x: t.x, y: my }, t];
}

function boundsOf(nodes: SceneNode[]): Rect {
  if (nodes.length === 0) return { x: 0, y: -GRID * 4, w: TERMINAL_SPAN, h: GRID * 8 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.rect.x);
    y0 = Math.min(y0, n.rect.y);
    x1 = Math.max(x1, n.rect.x + n.rect.w);
    y1 = Math.max(y1, n.rect.y + n.rect.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------- หาว่าจุดหนึ่งชี้อะไร ----------

export type Hit =
  | { kind: 'pin'; pin: ScenePin; node: SceneNode }
  | { kind: 'node'; node: SceneNode }
  | { kind: 'wire'; wire: SceneWire };

const inRect = (p: Point, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** ลำดับความสำคัญ: ขา → กล่อง → สาย; tolerance เป็นหน่วยโลก (ควรเป็นจำนวนพิกเซล / zoom) */
export function hitTest(scene: Scene, p: Point, tolerance = 8): Hit | null {
  let best: { pin: ScenePin; node: SceneNode; d: number } | null = null;
  for (const node of scene.nodes) {
    for (const pin of node.pins) {
      const d = Math.hypot(p.x - pin.pos.x, p.y - pin.pos.y);
      if (d <= tolerance && (!best || d < best.d)) best = { pin, node, d };
    }
  }
  if (best) return { kind: 'pin', pin: best.pin, node: best.node };
  // ชิ้นที่วางทีหลังอยู่บนสุด
  for (let i = scene.nodes.length - 1; i >= 0; i--) {
    const node = scene.nodes[i]!;
    if (inRect(p, node.rect)) return { kind: 'node', node };
  }
  for (let i = scene.wires.length - 1; i >= 0; i--) {
    const wire = scene.wires[i]!;
    for (let k = 1; k < wire.points.length; k++) {
      if (distToSegment(p, wire.points[k - 1]!, wire.points[k]!) <= tolerance / 2 + 2) return { kind: 'wire', wire };
    }
  }
  return null;
}

/** ชิ้นส่วนที่อยู่ในกรอบทั้งชิ้น (เลือกด้วยการลากกรอบ) */
export function nodesInRect(scene: Scene, r: Rect): string[] {
  const x0 = Math.min(r.x, r.x + r.w);
  const y0 = Math.min(r.y, r.y + r.h);
  const x1 = Math.max(r.x, r.x + r.w);
  const y1 = Math.max(r.y, r.y + r.h);
  return scene.nodes
    .filter((n) => n.kind === 'instance' && n.rect.x >= x0 && n.rect.y >= y0 && n.rect.x + n.rect.w <= x1 && n.rect.y + n.rect.h <= y1)
    .map((n) => n.id);
}

/** ชิ้นเงาตอนกำลังวาง (ยังไม่อยู่ในวงจร) */
export function ghostNode(defId: string, center: Point, options: SceneOptions, params?: Record<string, number>): SceneNode | undefined {
  const inst = { id: '__ghost', defId, x: center.x, y: center.y, rotation: 0 as Rotation, ...(params ? { params } : {}) };
  const scene = buildScene(
    { id: '__ghost', name: { th: '', en: '' }, kind: 'circuit', pins: [], body: { instances: [inst], wires: [] } },
    options,
  );
  return scene.nodes[0];
}

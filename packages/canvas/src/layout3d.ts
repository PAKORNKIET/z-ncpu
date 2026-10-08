// จัดวางมุมมอง 3D (Spec ส่วน 14 และ M4): แท่นซ้อนกันตามลำดับชั้นของวงจร และ NAND ทุกตัวเป็นก้อนเล็กบนแท่นของชิ้นที่มันอยู่
// ไม่แตะ DOM หรือ WebGL: รับแค่ path ของเกต (Netlist.gatePath) จึงทดสอบใน Node ได้

/** ระยะห่างระหว่าง NAND หนึ่งช่อง */
export const GATE_PITCH = 1;
/** ขนาดก้อน NAND */
export const GATE_SIZE = 0.7;
/** ความหนาของแท่น และระยะที่ชั้นในยกสูงกว่าชั้นนอก */
export const SLAB_H = 0.35;
export const LEVEL_H = 0.6;
const PAD = 0.6;
const GAP = 1;

export interface Node3D {
  /** path เต็มนับจากราก เช่น 'alu/add/fa3' ('' = รากเอง) */
  path: string;
  /** ชื่อ instance (ส่วนท้ายของ path) */
  id: string;
  depth: number;
  parent: number;
  children: number[];
  /** NAND ทั้งหมดในชิ้นนี้ รวมทุกชั้นข้างใน อยู่ที่ slot [start, end) */
  start: number;
  end: number;
  /** มุมของแท่น (x, z) ขนาด (w, d) และความสูงพื้นแท่น y */
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
}

export interface Layout3D {
  nodes: Node3D[];
  /** slot k คือ NAND ตัวที่ gates[k] ใน netlist (เรียงให้แต่ละชิ้นมี slot ติดกัน) */
  gates: Int32Array;
  /** จุดกึ่งกลางก้อนของ slot k อยู่ที่ pos[3k .. 3k+2] */
  pos: Float32Array;
  /** ชิ้นที่ NAND ใน slot k อยู่โดยตรง */
  owner: Int32Array;
  width: number;
  depthSize: number;
  maxDepth: number;
}

interface Box {
  w: number;
  d: number;
  /** ตำแหน่งในกล่องแม่ (มุม) */
  x: number;
  z: number;
}

/**
 * วางกล่องแบบ skyline (กล่องถัดไปลงตรงที่ต่ำสุดที่ใส่ได้ ภายในความกว้าง limit) คืนขนาดรวม
 * เติมช่องว่างข้างกล่องใหญ่ได้ดีกว่าการวางเป็นแถว
 */
function skyline(order: Box[], limit: number): { w: number; d: number; at: [number, number][] } {
  // ช่วงของเส้นขอบฟ้า: เริ่มที่ x กว้าง w สูง (ลึก) z
  let sky: { x: number; w: number; z: number }[] = [{ x: 0, w: limit, z: 0 }];
  const at: [number, number][] = [];
  let w = 0;
  let d = 0;
  for (const b of order) {
    const bw = b.w + GAP;
    let best: { x: number; z: number } | null = null;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i]!.x;
      if (x + b.w > limit + 1e-9) break;
      let z = 0;
      for (let j = i; j < sky.length && sky[j]!.x < x + bw - 1e-9; j++) z = Math.max(z, sky[j]!.z);
      if (!best || z < best.z - 1e-9) best = { x, z };
    }
    // กว้างกว่า limit (ไม่ควรเกิดเพราะ limit ≥ กล่องที่กว้างสุด) วางต่อท้ายด้านล่าง
    const p = best ?? { x: 0, z: Math.max(...sky.map((s) => s.z)) };
    at.push([p.x, p.z]);
    w = Math.max(w, p.x + b.w);
    d = Math.max(d, p.z + b.d);
    const top = p.z + b.d + GAP;
    const x1 = p.x + bw;
    const next: { x: number; w: number; z: number }[] = [];
    for (const s of sky) {
      const sx1 = s.x + s.w;
      if (sx1 <= p.x + 1e-9 || s.x >= x1 - 1e-9) {
        next.push(s);
        continue;
      }
      if (s.x < p.x) next.push({ x: s.x, w: p.x - s.x, z: s.z });
      if (sx1 > x1) next.push({ x: x1, w: sx1 - x1, z: s.z });
    }
    next.push({ x: p.x, w: Math.min(bw, limit - p.x), z: top });
    next.sort((a, c) => a.x - c.x);
    // รวมช่วงติดกันที่สูงเท่ากัน
    sky = [];
    for (const s of next) {
      const last = sky[sky.length - 1];
      if (last && Math.abs(last.z - s.z) < 1e-9 && Math.abs(last.x + last.w - s.x) < 1e-9) last.w += s.w;
      else if (s.w > 1e-9) sky.push({ ...s });
    }
  }
  return { w, d, at };
}

/** วางกล่องทั้งหมด ลองหลายความกว้างแล้วเลือกแบบที่พื้นที่รวมน้อยสุดและไม่ยาวเกินไป */
function pack(boxes: Box[]): { w: number; d: number } {
  if (boxes.length === 0) return { w: 0, d: 0 };
  const area = boxes.reduce((s, b) => s + (b.w + GAP) * (b.d + GAP), 0);
  const widest = Math.max(...boxes.map((b) => b.w));
  const order = [...boxes].sort((a, b) => b.d - a.d || b.w - a.w);
  let best: { w: number; d: number; at: [number, number][]; score: number } | null = null;
  // ความกว้างที่ลอง: ตามพื้นที่รวม และพอให้กล่องใหญ่สุดสองกล่องวางข้างกัน
  const byWidth = boxes.map((b) => b.w).sort((a, b) => b - a);
  const limits = [0.9, 1, 1.12, 1.25, 1.4, 1.6, 1.8].map((k) => Math.sqrt(area) * k);
  if (byWidth.length > 1) limits.push(byWidth[0]! + GAP + byWidth[1]!);
  for (const limit of limits) {
    const r = skyline(order, Math.max(widest, limit));
    const ratio = r.w / Math.max(r.d, 1e-9);
    const score = r.w * r.d * (ratio < 0.6 || ratio > 1.7 ? 1.5 : 1);
    if (!best || score < best.score) best = { ...r, score };
  }
  order.forEach((b, i) => {
    b.x = best!.at[i]![0];
    b.z = best!.at[i]![1];
  });
  return { w: best!.w, d: best!.d };
}

/**
 * สร้างผังจาก path ของเกต
 * root = ชั้นที่เป็นรากของมุมมอง เช่น 'dut' เพื่อแสดงเฉพาะ CPU ในวงจรห่อ ('' = ทั้งวงจร)
 */
export function buildLayout3D(gatePath: readonly string[], root = ''): Layout3D {
  const prefix = root === '' ? '' : `${root}/`;
  const nodes: Node3D[] = [];
  const direct: number[][] = [];
  const byPath = new Map<string, number>();
  const node = (path: string): number => {
    const found = byPath.get(path);
    if (found !== undefined) return found;
    const cut = path.lastIndexOf('/');
    const parent = path === '' ? -1 : node(cut === -1 ? '' : path.slice(0, cut));
    const i = nodes.length;
    nodes.push({
      path,
      id: path.slice(cut + 1),
      depth: parent === -1 ? 0 : nodes[parent]!.depth + 1,
      parent,
      children: [],
      start: 0,
      end: 0,
      x: 0,
      z: 0,
      w: 0,
      d: 0,
      y: 0,
    });
    direct.push([]);
    byPath.set(path, i);
    if (parent !== -1) nodes[parent]!.children.push(i);
    return i;
  };
  node('');
  for (let g = 0; g < gatePath.length; g++) {
    const p = gatePath[g]!;
    if (prefix !== '' && !p.startsWith(prefix)) continue;
    const rel = p.slice(prefix.length);
    const cut = rel.lastIndexOf('/');
    direct[node(cut === -1 ? '' : rel.slice(0, cut))]!.push(g);
  }

  // ขนาดจากล่างขึ้นบน: กล่องของลูกแต่ละชิ้น + บล็อก NAND ของชิ้นนี้เอง
  const layoutOf: { boxes: Box[]; block: Box | null; cols: number }[] = [];
  const sizeOf = (i: number): void => {
    const n = nodes[i]!;
    for (const c of n.children) sizeOf(c);
    const boxes: Box[] = n.children.map((c) => ({ w: nodes[c]!.w, d: nodes[c]!.d, x: 0, z: 0 }));
    const count = direct[i]!.length;
    const cols = Math.ceil(Math.sqrt(count));
    const block = count > 0 ? { w: cols * GATE_PITCH, d: Math.ceil(count / cols) * GATE_PITCH, x: 0, z: 0 } : null;
    const all = block ? [...boxes, block] : boxes;
    const size = pack(all);
    n.w = size.w + PAD * 2;
    n.d = size.d + PAD * 2;
    layoutOf[i] = { boxes, block, cols };
  };
  sizeOf(0);

  // ตำแหน่งจากบนลงล่าง พร้อมจัด slot ของ NAND ให้แต่ละชิ้นติดกัน (pre-order)
  const total = direct.reduce((s, d) => s + d.length, 0);
  const gates = new Int32Array(total);
  const pos = new Float32Array(total * 3);
  const owner = new Int32Array(total);
  let slot = 0;
  let maxDepth = 0;
  const place = (i: number, x: number, z: number): void => {
    const n = nodes[i]!;
    const { boxes, block, cols } = layoutOf[i]!;
    n.x = x;
    n.z = z;
    n.y = n.depth * LEVEL_H;
    n.start = slot;
    maxDepth = Math.max(maxDepth, n.depth);
    if (block) {
      const top = n.y + SLAB_H + GATE_SIZE / 2;
      direct[i]!.forEach((g, k) => {
        gates[slot] = g;
        owner[slot] = i;
        pos[slot * 3] = x + PAD + block.x + (k % cols) * GATE_PITCH + GATE_PITCH / 2;
        pos[slot * 3 + 1] = top;
        pos[slot * 3 + 2] = z + PAD + block.z + Math.floor(k / cols) * GATE_PITCH + GATE_PITCH / 2;
        slot++;
      });
    }
    n.children.forEach((c, k) => place(c, x + PAD + boxes[k]!.x, z + PAD + boxes[k]!.z));
    n.end = slot;
  };
  const root0 = nodes[0]!;
  place(0, -root0.w / 2, -root0.d / 2);
  return { nodes, gates, pos, owner, width: root0.w, depthSize: root0.d, maxDepth };
}

/** ผลรวมสะสมของค่าใน slot: จำนวนใน [start, end) = prefix[end] - prefix[start] */
export function prefixCounts(flags: ArrayLike<number>): Uint32Array {
  const out = new Uint32Array(flags.length + 1);
  for (let i = 0; i < flags.length; i++) out[i + 1] = out[i]! + (flags[i]! ? 1 : 0);
  return out;
}

/** ชิ้นที่ path ตรงกัน หรือ -1 */
export function findNode(layout: Layout3D, path: string): number {
  return layout.nodes.findIndex((n) => n.path === path);
}

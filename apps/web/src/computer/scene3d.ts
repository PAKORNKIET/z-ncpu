// ฉาก 3D ของ CPU (M4-3): แท่นของแต่ละชิ้นแยก InstancedMesh ตามชั้น และ NAND ทุกตัวใน InstancedMesh เดียว
// ไม่ผูกกับ React: View3D เป็นคนสร้าง ส่งค่า NAND มาให้ (update) และถามว่าคลิกโดนอะไร (pick)
import { GATE_SIZE, prefixCounts, SLAB_H, type Layout3D } from '@z-ncpu/canvas';
import * as THREE from 'three';

export interface Palette {
  platformNear: THREE.Color;
  platformFar: THREE.Color;
  high: THREE.Color;
  low: THREE.Color;
  unknown: THREE.Color;
  accent: THREE.Color;
}

/** อ่านสีจาก CSS variable ของธีมปัจจุบัน */
export function readPalette(el: Element = document.documentElement): Palette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string): THREE.Color => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  const border = v('--border', '#2a2f3a');
  const muted = v('--muted', '#9aa2b1');
  return {
    platformNear: border.clone().lerp(muted, 0.15),
    platformFar: border.clone().lerp(muted, 0.6),
    high: v('--signal-high', '#ffcc4d'),
    low: v('--signal-low', '#5f6b80'),
    unknown: v('--signal-unknown', '#7d8594'),
    accent: v('--accent', '#6ea8ff'),
  };
}

/** ขนาดบนจอ (px) ที่เริ่มแสดงแท่นชั้นนั้น และ NAND */
const SHOW_LEVEL_PX = 14;
const SHOW_GATE_PX = 2.5;

export interface Activity {
  /** NAND ที่เป็น 1 อยู่ และที่เปลี่ยนค่าในการอัปเดตล่าสุด ของชิ้น i */
  high(i: number): number;
  changed(i: number): number;
}

export class Scene3D implements Activity {
  readonly group = new THREE.Group();
  private readonly levels: THREE.InstancedMesh[] = [];
  /** ชิ้น i อยู่ใน mesh ของชั้น depth ที่ instance nodeInstance[i] */
  private readonly nodeInstance: Int32Array;
  /** instance k ของชั้น d คือชิ้น levelNodes[d][k] */
  private readonly levelNodes: Int32Array[] = [];
  private readonly levelSize: number[] = [];
  private readonly gateMesh: THREE.InstancedMesh;
  private readonly gateColors: Float32Array;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private prev: Uint8Array | null = null;
  private highPrefix: Uint32Array;
  private changedPrefix: Uint32Array;
  private slotValue: Uint8Array;
  private slotChanged: Uint8Array;
  private palette: Palette;
  selected = 0;
  /** ชั้นลึกสุดที่แสดงอยู่ และแสดง NAND หรือไม่ (จาก lod) */
  visibleDepth = 0;
  gatesVisible = false;

  constructor(readonly layout: Layout3D, palette: Palette) {
    this.palette = palette;
    const { nodes, gates, pos } = layout;
    const n = gates.length;
    this.slotValue = new Uint8Array(n).fill(2);
    this.slotChanged = new Uint8Array(n);
    this.highPrefix = new Uint32Array(n + 1);
    this.changedPrefix = new Uint32Array(n + 1);

    const box = new THREE.BoxGeometry(1, 1, 1);
    this.geometries.push(box);
    const slabMat = new THREE.MeshLambertMaterial();
    this.materials.push(slabMat);

    // แท่น: แยก mesh ตามชั้น จะได้ซ่อนชั้นลึกตอนซูมออก (ลดรายละเอียดตามระยะ)
    this.nodeInstance = new Int32Array(nodes.length);
    const byDepth: number[][] = Array.from({ length: layout.maxDepth + 1 }, () => []);
    nodes.forEach((node, i) => {
      this.nodeInstance[i] = byDepth[node.depth]!.length;
      byDepth[node.depth]!.push(i);
    });
    const m = new THREE.Matrix4();
    byDepth.forEach((list, depth) => {
      const mesh = new THREE.InstancedMesh(box, slabMat, Math.max(1, list.length));
      mesh.count = list.length;
      list.forEach((i, k) => {
        const node = nodes[i]!;
        m.makeScale(node.w, SLAB_H, node.d).setPosition(node.x + node.w / 2, node.y + SLAB_H / 2, node.z + node.d / 2);
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, palette.platformNear);
      });
      mesh.computeBoundingSphere();
      mesh.userData = { depth };
      this.levels.push(mesh);
      this.levelNodes.push(Int32Array.from(list));
      // ชั้นนี้แสดงเมื่อชิ้นที่ใหญ่สุดในชั้นใหญ่พอบนจอ (ชิ้นเล็กในชั้นเดียวกันแสดงไปด้วย)
      this.levelSize.push(Math.max(0, ...list.map((i) => Math.max(nodes[i]!.w, nodes[i]!.d))));
      this.group.add(mesh);
    });

    // NAND: ก้อนเล็กบนแท่นของชิ้นที่มันอยู่
    const gateGeo = new THREE.BoxGeometry(GATE_SIZE, GATE_SIZE, GATE_SIZE);
    const gateMat = new THREE.MeshLambertMaterial();
    this.geometries.push(gateGeo);
    this.materials.push(gateMat);
    this.gateMesh = new THREE.InstancedMesh(gateGeo, gateMat, Math.max(1, n));
    this.gateMesh.count = n;
    for (let k = 0; k < n; k++) {
      m.makeTranslation(pos[k * 3]!, pos[k * 3 + 1]!, pos[k * 3 + 2]!);
      this.gateMesh.setMatrixAt(k, m);
    }
    this.gateColors = new Float32Array(Math.max(1, n) * 3);
    this.gateMesh.instanceColor = new THREE.InstancedBufferAttribute(this.gateColors, 3);
    this.gateMesh.computeBoundingSphere();
    this.gateMesh.visible = false;
    this.group.add(this.gateMesh);
    this.recolor();
  }

  high(i: number): number {
    const node = this.layout.nodes[i]!;
    return this.highPrefix[node.end]! - this.highPrefix[node.start]!;
  }

  changed(i: number): number {
    const node = this.layout.nodes[i]!;
    return this.changedPrefix[node.end]! - this.changedPrefix[node.start]!;
  }

  /** มีค่าของ NAND แล้วหรือยัง */
  get hasValues(): boolean {
    return this.prev !== null;
  }

  setPalette(p: Palette): void {
    this.palette = p;
    this.recolor();
  }

  /** ค่าขาออกของ NAND ทุกตัว (ลำดับเดียวกับ netlist) จาก worker */
  update(values: Uint8Array): void {
    const { gates } = this.layout;
    const prev = this.prev && this.prev.length === values.length ? this.prev : null;
    for (let k = 0; k < gates.length; k++) {
      const g = gates[k]!;
      const v = values[g] ?? 2;
      this.slotValue[k] = v;
      this.slotChanged[k] = prev !== null && prev[g] !== v ? 1 : 0;
    }
    this.prev = values;
    this.highPrefix = prefixCounts(this.slotValue.map((v) => (v === 1 ? 1 : 0)));
    this.changedPrefix = prefixCounts(this.slotChanged);
    this.recolor();
  }

  select(i: number): void {
    this.selected = i;
    this.recolor();
  }

  /** ระบายสีทุกแท่นและ NAND ตามค่าล่าสุด */
  private recolor(): void {
    const p = this.palette;
    const { nodes, maxDepth } = this.layout;
    const c = new THREE.Color();
    const selected = nodes[this.selected];
    this.levels.forEach((mesh, depth) => {
      const base = p.platformNear.clone().lerp(p.platformFar, maxDepth === 0 ? 0 : depth / maxDepth);
      const list = this.levelNodes[depth]!;
      for (let k = 0; k < list.length; k++) {
        const i = list[k]!;
        const node = nodes[i]!;
        const total = node.end - node.start;
        c.copy(base);
        if (total > 0) {
          // สว่างตามสัดส่วนที่เป็น 1 และวาบตามจำนวนที่เพิ่งเปลี่ยนค่า (ไฟวิ่งตอนรัน)
          c.lerp(p.high, 0.18 * (this.high(i) / total));
          c.lerp(p.high, Math.min(1, (this.changed(i) / total) * 3) * 0.35);
        }
        if (selected && i === this.selected && i !== 0) c.lerp(p.accent, 0.45);
        mesh.setColorAt(k, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    const col = this.gateColors;
    const flash = p.high.clone().lerp(new THREE.Color(1, 1, 1), 0.45);
    const lowDim = p.low.clone().multiplyScalar(0.7);
    const lowFlash = p.low.clone().lerp(p.high, 0.5);
    const unknown = p.unknown.clone().multiplyScalar(0.6);
    for (let k = 0; k < this.slotValue.length; k++) {
      const v = this.slotValue[k];
      const ch = this.slotChanged[k] === 1;
      const src = v === 1 ? (ch ? flash : p.high) : v === 0 ? (ch ? lowFlash : lowDim) : unknown;
      col[k * 3] = src.r;
      col[k * 3 + 1] = src.g;
      col[k * 3 + 2] = src.b;
    }
    if (this.gateMesh.instanceColor) this.gateMesh.instanceColor.needsUpdate = true;
  }

  /**
   * ลดรายละเอียดตามระยะซูม: แสดงชั้นที่แท่นใหญ่พอบนจอ และ NAND เมื่อก้อนใหญ่เกิน ~2 px
   * pxPerUnit = จำนวน px บนจอต่อ 1 หน่วยที่ระยะของจุดที่มองอยู่
   */
  lod(pxPerUnit: number): void {
    let depth = 0;
    for (let d = 1; d < this.levels.length; d++) {
      if (this.levelSize[d]! * pxPerUnit < SHOW_LEVEL_PX) break;
      depth = d;
    }
    this.visibleDepth = depth;
    this.levels.forEach((mesh, d) => (mesh.visible = d <= depth));
    this.gatesVisible = depth === this.levels.length - 1 && GATE_SIZE * pxPerUnit >= SHOW_GATE_PX;
    this.gateMesh.visible = this.gatesVisible;
  }

  /** ชิ้นที่ราย (ray) ชนก่อน (NAND นับเป็นชิ้นที่มันอยู่) หรือ -1 */
  pick(raycaster: THREE.Raycaster): number {
    const targets = [...this.levels, this.gateMesh].filter((o) => o.visible);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit || hit.instanceId === undefined) return -1;
    if (hit.object === this.gateMesh) return this.layout.owner[hit.instanceId] ?? -1;
    const depth = (hit.object.userData as { depth: number }).depth;
    return this.levelNodes[depth]?.[hit.instanceId] ?? -1;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const mesh of [...this.levels, this.gateMesh]) mesh.dispose();
  }
}

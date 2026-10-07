// แปลงเมาส์/ทัชและคีย์บอร์ดเป็นคำสั่งของ Editor (Spec ส่วน 14)
// ไม่แตะ DOM: host ส่งพิกัดบนจอ (px เทียบมุมซ้ายบนของ canvas) เข้ามา จึงทดสอบได้ใน Node
//
// เมาส์ซ้ายบนขา      → ลากไปปล่อยบนอีกขาเพื่อต่อสาย (หรือคลิกขาหนึ่ง แล้วคลิกอีกขา)
// เมาส์ซ้ายบนชิ้น     → เลือกและลาก (Shift = เลือกเพิ่ม)
// เมาส์ซ้ายบนขาเข้าวงจร → คลิกเพื่อสลับ 0/1
// เมาส์ซ้ายที่ว่าง    → ลากเพื่อเลื่อนจอ (Shift = ลากกรอบเลือก)
// ปุ่มกลาง/ขวา       → ลากเพื่อเลื่อนจอ
// ล้อเมาส์           → ซูมตรงตำแหน่งเมาส์
// ดับเบิลคลิกชิ้น     → ดูข้างใน (X-Ray)
// โหมดอ่านอย่างเดียว (X-Ray): เลือก เลื่อนจอ ซูม และดับเบิลคลิกเข้าไปลึกขึ้นได้ แต่แก้วงจรไม่ได้

import type { PinRef } from '@z-ncpu/shared';
import type { Editor } from './editor/editor';
import { snap, snapPoint, toScreen, toWorld, zoomAt, type Camera, type Point, type Rect } from './geometry';
import { hitTest, nodesInRect, pinKey, type Hit, type Scene, type ScenePin } from './scene';

export interface PointerInput {
  /** พิกัด px เทียบมุมซ้ายบนของ canvas */
  x: number;
  y: number;
  /** 0 = ซ้าย, 1 = กลาง, 2 = ขวา */
  button: number;
  shift?: boolean;
}

export interface KeyInput {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
}

export interface PlaceSpec {
  defId: string;
  params?: Record<string, number>;
}

/** สิ่งที่วาดทับวงจรชั่วคราว */
export interface Overlay {
  ghostWire?: { from: Point; to: Point; valid: boolean };
  placing?: PlaceSpec & { center: Point };
  marquee?: Rect;
  hoverPin?: PinRef;
  /** ขาที่ต่อกับขาที่กำลังลากได้ (ไฮไลต์ให้เห็น) */
  targets?: PinRef[];
}

type Mode =
  | { k: 'idle' }
  | { k: 'pan'; start: Point; camera: Camera; moved: boolean }
  | { k: 'drag'; ids: string[]; start: Point; applied: Point; clickedId: string; wasSelected: boolean; shift: boolean }
  | { k: 'wire'; from: ScenePin; start: Point; sticky: boolean }
  | { k: 'marquee'; start: Point; end: Point }
  | { k: 'toggle'; pin: string; start: Point }
  | { k: 'place'; spec: PlaceSpec };

/** ขยับเกินกี่ px ถึงนับว่าลาก ไม่ใช่คลิก */
const CLICK_SLOP = 4;
/** รัศมีที่นับว่าชี้โดนขา (px บนจอ) */
const PIN_HIT_PX = 9;

export interface InteractionOptions {
  /** คำนวณ Scene ล่าสุดของวงจรใน editor (host cache ไว้ตาม def ได้) */
  scene: () => Scene;
  /** คลิกขาเข้าของวงจรเพื่อสลับค่า */
  onToggleInput?: (pin: string) => void;
  /** มีอะไรเปลี่ยนที่ต้องวาดใหม่ */
  onChange?: () => void;
  /** ดับเบิลคลิกชิ้นส่วนเพื่อดูข้างใน */
  onOpen?: (instanceId: string) => void;
  /** ดูอย่างเดียว แก้ไม่ได้ (X-Ray) */
  readOnly?: boolean;
  /** โหมด Why?: คลิกขาหรือสายเพื่อถามว่าค่ามาจากไหน */
  onProbe?: (ref: PinRef) => void;
}

export class Interaction {
  camera: Camera = { x: -120, y: -200, zoom: 1 };
  private mode: Mode = { k: 'idle' };
  private cursorWorld: Point | null = null;
  private hover: Hit | null = null;
  /** โหมด Why?: คลิกขาหรือสายแทนการต่อสาย (ใช้ได้ทั้งตอนแก้และตอน X-Ray) */
  probeMode = false;

  constructor(
    private readonly editor: Editor,
    private readonly options: InteractionOptions,
  ) {}

  // ---------- สถานะสำหรับ host ----------

  get placing(): PlaceSpec | null {
    return this.mode.k === 'place' ? this.mode.spec : null;
  }

  /** ต่อสายแบบคลิกทีละขาค้างอยู่หรือไม่ */
  get wiring(): boolean {
    return this.mode.k === 'wire';
  }

  cursor(): string {
    switch (this.mode.k) {
      case 'pan':
        return 'grabbing';
      case 'drag':
        return 'move';
      case 'wire':
      case 'place':
      case 'marquee':
        return 'crosshair';
      default:
        if (this.probeMode) return this.hover?.kind === 'pin' || this.hover?.kind === 'wire' ? 'help' : 'grab';
        if (this.hover?.kind === 'pin' && !this.options.readOnly) return 'crosshair';
        if (this.hover?.kind === 'node' && this.options.readOnly) return 'pointer';
        if (this.hover?.kind === 'node') return this.hover.node.kind === 'input' ? 'pointer' : 'move';
        if (this.hover?.kind === 'wire') return 'pointer';
        return 'grab';
    }
  }

  overlay(): Overlay {
    const o: Overlay = {};
    const m = this.mode;
    if (this.hover?.kind === 'pin' && (!this.options.readOnly || this.probeMode)) o.hoverPin = this.hover.pin.ref;
    if (m.k === 'wire' && this.cursorWorld) {
      // ขาเข้าที่มีสายอยู่แล้วรับเพิ่มไม่ได้
      const driven = new Set((this.editor.def.body?.wires ?? []).map((w) => pinKey(w.to)));
      const ok = (p: ScenePin): boolean => compatible(m.from, p) && !driven.has(pinKey(p.role === 'sink' ? p.ref : m.from.ref));
      const target = this.hover?.kind === 'pin' ? this.hover.pin : null;
      o.ghostWire = { from: m.from.pos, to: target ? target.pos : this.cursorWorld, valid: target ? ok(target) : true };
      o.targets = [...this.options.scene().pins.values()].filter(ok).map((p) => p.ref);
    }
    if (m.k === 'place' && this.cursorWorld) o.placing = { ...m.spec, center: snapPoint(this.cursorWorld) };
    if (m.k === 'marquee') o.marquee = { x: m.start.x, y: m.start.y, w: m.end.x - m.start.x, h: m.end.y - m.start.y };
    return o;
  }

  // ---------- คำสั่งจาก host ----------

  /** เริ่มวางชิ้นส่วน: ชิ้นเงาตามเมาส์ คลิกเพื่อวาง (Shift ค้างไว้ = วางต่อได้หลายชิ้น) */
  beginPlace(spec: PlaceSpec): void {
    if (this.options.readOnly) return;
    this.mode = { k: 'place', spec };
    this.changed();
  }

  /** วางชิ้นส่วนที่จุดบนจอ (ใช้กับลากจากกล่องเครื่องมือมาปล่อย) */
  dropAt(screen: Point, spec: PlaceSpec): string | undefined {
    if (this.options.readOnly) return undefined;
    const at = snapPoint(toWorld(this.camera, screen));
    const id = this.editor.add({ defId: spec.defId, x: at.x, y: at.y, ...(spec.params ? { params: spec.params } : {}) });
    this.mode = { k: 'idle' };
    this.changed();
    return id;
  }

  cancel(): void {
    if (this.mode.k === 'drag') this.editor.endDrag();
    this.mode = { k: 'idle' };
    this.changed();
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
    this.changed();
  }

  /** ตำแหน่งบนจอของขา (ใช้ในเทสต์และการช่วยเหลือการเข้าถึง) */
  pinOnScreen(ref: PinRef): Point | undefined {
    const pin = this.options.scene().pins.get(pinKey(ref));
    return pin ? toScreen(this.camera, pin.pos) : undefined;
  }

  // ---------- เมาส์ ----------

  pointerDown(p: PointerInput): void {
    const world = toWorld(this.camera, p);
    this.cursorWorld = world;
    this.editor.lastError = undefined;

    if (p.button !== 0) {
      this.mode = { k: 'pan', start: p, camera: this.camera, moved: false };
      return this.changed();
    }

    const m = this.mode;
    if (m.k === 'place') return; // วางตอนปล่อยเมาส์

    const hit = this.hitAt(world);
    if (this.probeMode && (hit?.kind === 'pin' || hit?.kind === 'wire')) {
      // สายถามที่ขาต้นทาง (ตัวขับ) ของมัน
      this.options.onProbe?.(hit.kind === 'pin' ? hit.pin.ref : hit.wire.from);
      this.mode = { k: 'idle' };
      return this.changed();
    }
    if (this.options.readOnly || this.probeMode) {
      // ดูอย่างเดียว: คลิกชิ้นเพื่อเลือก ลากที่ไหนก็เลื่อนจอ
      if (hit?.kind === 'node' && hit.node.kind === 'instance') this.editor.select({ instances: [hit.node.id] });
      this.mode = { k: 'pan', start: p, camera: this.camera, moved: hit?.kind === 'node' };
      return this.changed();
    }
    if (m.k === 'wire' && m.sticky) {
      // โหมดคลิกทีละขา: คลิกขาที่สองเพื่อต่อ คลิกที่อื่นเพื่อยกเลิก
      if (hit?.kind === 'pin' && pinKey(hit.pin.ref) !== pinKey(m.from.ref)) this.editor.connect(m.from.ref, hit.pin.ref);
      this.mode = { k: 'idle' };
      return this.changed();
    }

    if (hit?.kind === 'pin') {
      this.mode = { k: 'wire', from: hit.pin, start: p, sticky: false };
    } else if (hit?.kind === 'node' && hit.node.kind === 'input') {
      this.mode = { k: 'toggle', pin: hit.node.id.slice('self.'.length), start: p };
    } else if (hit?.kind === 'node' && hit.node.kind === 'instance') {
      const id = hit.node.id;
      const sel = this.editor.selection.instances;
      const wasSelected = sel.includes(id);
      if (!wasSelected) this.editor.select({ instances: p.shift ? [...sel, id] : [id], wires: p.shift ? this.editor.selection.wires : [] });
      this.mode = {
        k: 'drag',
        ids: [...this.editor.selection.instances],
        start: world,
        applied: { x: 0, y: 0 },
        clickedId: id,
        wasSelected,
        shift: !!p.shift,
      };
    } else if (hit?.kind === 'wire') {
      const wires = this.editor.selection.wires;
      this.editor.select(
        p.shift
          ? { instances: this.editor.selection.instances, wires: wires.includes(hit.wire.id) ? wires.filter((w) => w !== hit.wire.id) : [...wires, hit.wire.id] }
          : { wires: [hit.wire.id] },
      );
    } else if (p.shift) {
      this.mode = { k: 'marquee', start: world, end: world };
    } else {
      this.mode = { k: 'pan', start: p, camera: this.camera, moved: false };
    }
    this.changed();
  }

  pointerMove(p: PointerInput): void {
    const world = toWorld(this.camera, p);
    this.cursorWorld = world;
    const m = this.mode;
    switch (m.k) {
      case 'pan': {
        const dx = p.x - m.start.x;
        const dy = p.y - m.start.y;
        if (Math.hypot(dx, dy) > CLICK_SLOP) m.moved = true;
        this.camera = { ...m.camera, x: m.camera.x - dx / m.camera.zoom, y: m.camera.y - dy / m.camera.zoom };
        break;
      }
      case 'drag': {
        const want = { x: snap(world.x - m.start.x), y: snap(world.y - m.start.y) };
        const dx = want.x - m.applied.x;
        const dy = want.y - m.applied.y;
        if (dx !== 0 || dy !== 0) {
          this.editor.drag(m.ids, dx, dy);
          m.applied = want;
        }
        break;
      }
      case 'marquee':
        m.end = world;
        break;
      default:
        break;
    }
    this.hover = m.k === 'pan' || m.k === 'drag' ? null : this.hitAt(world);
    this.changed();
  }

  pointerUp(p: PointerInput): void {
    const world = toWorld(this.camera, p);
    this.cursorWorld = world;
    const m = this.mode;
    const moved = (start: Point): boolean => Math.hypot(p.x - start.x, p.y - start.y) > CLICK_SLOP;

    switch (m.k) {
      case 'place':
        if (p.button === 0) {
          const at = snapPoint(world);
          this.editor.add({ defId: m.spec.defId, x: at.x, y: at.y, ...(m.spec.params ? { params: m.spec.params } : {}) });
          if (!p.shift) this.mode = { k: 'idle' };
        }
        break;
      case 'pan':
        // คลิกที่ว่างโดยไม่ลาก = ยกเลิกการเลือก
        if (!m.moved && p.button === 0) this.editor.clearSelection();
        this.mode = { k: 'idle' };
        break;
      case 'drag':
        this.editor.endDrag();
        // คลิก (ไม่ลาก) ชิ้นที่เลือกอยู่แล้ว: Shift = เอาออกจากที่เลือก, ไม่กด Shift = เลือกชิ้นนี้ชิ้นเดียว
        if (m.applied.x === 0 && m.applied.y === 0 && m.wasSelected) {
          const sel = this.editor.selection;
          this.editor.select(
            m.shift ? { instances: sel.instances.filter((i) => i !== m.clickedId), wires: sel.wires } : { instances: [m.clickedId] },
          );
        }
        this.mode = { k: 'idle' };
        break;
      case 'wire': {
        const hit = this.hitAt(world);
        if (hit?.kind === 'pin' && pinKey(hit.pin.ref) !== pinKey(m.from.ref)) {
          this.editor.connect(m.from.ref, hit.pin.ref);
          this.mode = { k: 'idle' };
        } else if (!moved(m.start)) {
          // คลิกขาแล้วปล่อย = เริ่มต่อสายแบบคลิกทีละขา
          this.mode = { ...m, sticky: true };
        } else {
          this.mode = { k: 'idle' };
        }
        break;
      }
      case 'marquee': {
        const r = { x: m.start.x, y: m.start.y, w: m.end.x - m.start.x, h: m.end.y - m.start.y };
        const picked = nodesInRect(this.options.scene(), r);
        const sel = this.editor.selection.instances;
        this.editor.select({ instances: [...new Set([...sel, ...picked])], wires: this.editor.selection.wires });
        this.mode = { k: 'idle' };
        break;
      }
      case 'toggle':
        if (!moved(m.start)) this.options.onToggleInput?.(m.pin);
        this.mode = { k: 'idle' };
        break;
      case 'idle':
        break;
    }
    this.hover = this.hitAt(world);
    this.changed();
  }

  /** เมาส์ออกนอก canvas */
  pointerLeave(): void {
    this.cursorWorld = null;
    this.hover = null;
    this.changed();
  }

  /** ดับเบิลคลิก: ชิ้นส่วน → onOpen (ดูข้างใน) คืน true ถ้าโดนชิ้นส่วน */
  doubleClick(p: Point): boolean {
    const hit = this.hitAt(toWorld(this.camera, p));
    if (hit?.kind !== 'node' || hit.node.kind !== 'instance') return false;
    this.mode = { k: 'idle' };
    this.options.onOpen?.(hit.node.id);
    this.changed();
    return true;
  }

  /** deltaY > 0 = ซูมออก */
  wheel(p: Point, deltaY: number): void {
    const factor = Math.pow(1.0015, -Math.max(-300, Math.min(300, deltaY)));
    this.camera = zoomAt(this.camera, p, factor);
    this.changed();
  }

  // ---------- คีย์บอร์ด ----------

  /** คืน true ถ้าใช้ปุ่มนี้แล้ว (host ควร preventDefault) */
  key(k: KeyInput): boolean {
    const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
    if (this.options.readOnly) {
      if (key !== 'Escape' || this.editor.selection.instances.length === 0) return false;
      this.editor.clearSelection();
      this.changed();
      return true;
    }
    if (k.ctrl && key === 'z') {
      this.cancelGesture();
      if (k.shift) this.editor.redo();
      else this.editor.undo();
    } else if (k.ctrl && key === 'y') {
      this.cancelGesture();
      this.editor.redo();
    } else if (key === 'Delete' || key === 'Backspace') {
      if (this.mode.k !== 'idle') return false;
      this.editor.deleteSelection();
    } else if (key === 'r' && !k.ctrl) {
      if (this.mode.k !== 'idle') return false;
      this.editor.rotate();
    } else if (key === 'Escape') {
      if (this.mode.k !== 'idle') this.cancel();
      else this.editor.clearSelection();
    } else if (k.ctrl && key === 'a') {
      this.editor.select({ instances: (this.editor.def.body?.instances ?? []).map((i) => i.id) });
    } else {
      return false;
    }
    this.changed();
    return true;
  }

  // ---------- ภายใน ----------

  private cancelGesture(): void {
    if (this.mode.k === 'drag') this.editor.endDrag();
    if (this.mode.k !== 'place') this.mode = { k: 'idle' };
  }

  private hitAt(world: Point): Hit | null {
    return hitTest(this.options.scene(), world, PIN_HIT_PX / this.camera.zoom);
  }

  private changed(): void {
    this.options.onChange?.();
  }
}

/** ต่อสองขานี้ได้ไหม (ดูแค่ทิศกับความกว้าง Editor ตรวจซ้ำอีกทีตอนต่อจริง) */
function compatible(a: ScenePin, b: ScenePin): boolean {
  return a.role !== b.role && a.width === b.width && pinKey(a.ref) !== pinKey(b.ref);
}

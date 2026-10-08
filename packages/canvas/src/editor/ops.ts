// การแก้ไขวงจรแบบ pure function: รับ ComponentDef เดิม คืน ComponentDef ใหม่ ไม่แก้ของเดิม (Spec ส่วน 14)
// ใช้คู่กับ History เพื่อ undo/redo ได้แน่นอนทุกครั้ง

import type { CircuitBody, ComponentDef, Instance, LocalizedText, PinDef, PinRef, Rotation, Wire } from '@z-ncpu/shared';
import { terminalCenter } from '../scene';

/** หา pin ของชิ้นส่วน (app ส่ง ComponentLibrary.pinsOf มาให้) */
export type PinResolver = (defId: string, params?: Record<string, number>) => PinDef[] | undefined;

export type OpResult = { ok: true; def: ComponentDef } | { ok: false; reason: LocalizedText };

const fail = (th: string, en: string): OpResult => ({ ok: false, reason: { th, en } });

function body(def: ComponentDef): CircuitBody {
  return def.body ?? { instances: [], wires: [] };
}

function withBody(def: ComponentDef, b: CircuitBody): ComponentDef {
  return { ...def, body: b };
}

/** id ใหม่ที่ไม่ซ้ำ เช่น prim.nand → nand1, nand2 … */
export function nextId(existing: Iterable<string>, base: string): string {
  const taken = new Set(existing);
  const stem = (base.split('.').pop() ?? 'part').replace(/[^a-zA-Z0-9_]/g, '') || 'part';
  for (let n = 1; ; n++) {
    const id = `${stem}${n}`;
    if (!taken.has(id)) return id;
  }
}

export interface AddInstanceInput {
  defId: string;
  x: number;
  y: number;
  params?: Record<string, number>;
  rotation?: Rotation;
  id?: string;
}

export function addInstance(def: ComponentDef, input: AddInstanceInput): { def: ComponentDef; id: string } {
  const b = body(def);
  const id = input.id ?? nextId(b.instances.map((i) => i.id), input.defId);
  if (b.instances.some((i) => i.id === id) || id === 'self') throw new Error(`id "${id}" ซ้ำ`);
  const inst: Instance = { id, defId: input.defId, x: input.x, y: input.y, rotation: input.rotation ?? 0 };
  if (input.params) inst.params = { ...input.params };
  return { def: withBody(def, { ...b, instances: [...b.instances, inst] }), id };
}

/** ลบชิ้นส่วนพร้อมสายที่ต่ออยู่ */
export function removeInstances(def: ComponentDef, ids: readonly string[]): ComponentDef {
  const gone = new Set(ids);
  const b = body(def);
  return withBody(def, {
    ...b,
    instances: b.instances.filter((i) => !gone.has(i.id)),
    wires: b.wires.filter((w) => !gone.has(w.from.inst) && !gone.has(w.to.inst)),
  });
}

/** ตำแหน่งปัจจุบันของขาวงจรเอง (ที่ผู้เล่นย้ายไว้ หรือตำแหน่งตั้งต้น) */
export function terminalPos(def: ComponentDef, pin: string): { x: number; y: number } | undefined {
  const p = def.pins.find((q) => q.name === pin);
  if (!p) return undefined;
  const saved = def.body?.terminals?.[pin];
  if (saved) return saved;
  const same = def.pins.filter((q) => q.dir === p.dir);
  return terminalCenter(p.dir, same.indexOf(p), same.length);
}

/** ย้ายชิ้นส่วน และขาวงจรเอง (id "self.<ชื่อขา>") */
export function moveInstances(def: ComponentDef, ids: readonly string[], dx: number, dy: number): ComponentDef {
  const moving = new Set(ids);
  const b = body(def);
  const next: CircuitBody = {
    ...b,
    instances: b.instances.map((i) => (moving.has(i.id) ? { ...i, x: i.x + dx, y: i.y + dy } : i)),
  };
  const selfPins = ids.filter((id) => id.startsWith('self.')).map((id) => id.slice('self.'.length));
  if (selfPins.length > 0) {
    const terminals = { ...b.terminals };
    for (const pin of selfPins) {
      const at = terminalPos(def, pin);
      if (at) terminals[pin] = { x: at.x + dx, y: at.y + dy };
    }
    next.terminals = terminals;
  }
  return withBody(def, next);
}

export function rotateInstances(def: ComponentDef, ids: readonly string[]): ComponentDef {
  const turning = new Set(ids);
  const b = body(def);
  return withBody(def, {
    ...b,
    instances: b.instances.map((i) =>
      turning.has(i.id) ? { ...i, rotation: (((i.rotation + 90) % 360) as Rotation) } : i,
    ),
  });
}

export function setLabel(def: ComponentDef, id: string, label: string): ComponentDef {
  const b = body(def);
  const text = label.trim();
  return withBody(def, {
    ...b,
    instances: b.instances.map((i) => {
      if (i.id !== id) return i;
      const next = { ...i };
      if (text) next.label = text;
      else delete next.label;
      return next;
    }),
  });
}

export function removeWires(def: ComponentDef, wireIds: readonly string[]): ComponentDef {
  const gone = new Set(wireIds);
  const b = body(def);
  return withBody(def, { ...b, wires: b.wires.filter((w) => !gone.has(w.id)) });
}

/** ปลายสายแต่ละข้างเป็น "ต้นทาง" (ขาออกของชิ้น หรือขาเข้าของวงจรนี้) หรือ "ปลายทาง" */
type EndKind = { role: 'source' | 'sink'; width: number };

function endKind(def: ComponentDef, ref: PinRef, pinsOf: PinResolver): EndKind | LocalizedText {
  if (ref.inst === 'self') {
    const pin = def.pins.find((p) => p.name === ref.pin);
    if (!pin) return { th: `วงจรนี้ไม่มีขา "${ref.pin}"`, en: `This circuit has no pin "${ref.pin}"` };
    return { role: pin.dir === 'in' ? 'source' : 'sink', width: pin.width };
  }
  const inst = body(def).instances.find((i) => i.id === ref.inst);
  if (!inst) return { th: `ไม่มีชิ้นส่วน "${ref.inst}"`, en: `No instance "${ref.inst}"` };
  let pins: PinDef[] | undefined;
  try {
    pins = pinsOf(inst.defId, inst.params);
  } catch {
    pins = undefined;
  }
  const pin = pins?.find((p) => p.name === ref.pin);
  if (!pin) return { th: `ชิ้น "${ref.inst}" ไม่มีขา "${ref.pin}"`, en: `Instance "${ref.inst}" has no pin "${ref.pin}"` };
  return { role: pin.dir === 'out' ? 'source' : 'sink', width: pin.width };
}

const sameRef = (a: PinRef, b: PinRef): boolean => a.inst === b.inst && a.pin === b.pin;

/**
 * ต่อสายระหว่างสองขา ลำดับที่คลิกไม่สำคัญ ระบบจัดให้ from = ต้นทาง, to = ปลายทาง
 * กฎ: ต้องเป็นต้นทางกับปลายทางอย่างละข้าง, ความกว้างเท่ากัน, ปลายทางรับได้สายเดียว
 */
export function connect(def: ComponentDef, a: PinRef, b: PinRef, pinsOf: PinResolver, wireId?: string): OpResult & { wireId?: string } {
  if (sameRef(a, b)) return fail('ต่อขาเข้ากับตัวเองไม่ได้', 'Cannot connect a pin to itself');
  const ka = endKind(def, a, pinsOf);
  if ('th' in ka) return { ok: false, reason: ka };
  const kb = endKind(def, b, pinsOf);
  if ('th' in kb) return { ok: false, reason: kb };
  if (ka.role === kb.role) {
    return ka.role === 'source'
      ? fail('ต่อขาออกเข้ากับขาออกไม่ได้ ต้องต่อขาออกเข้ากับขาเข้า', 'Cannot connect two outputs; connect an output to an input')
      : fail('ต่อขาเข้ากับขาเข้าไม่ได้ ต้องต่อขาออกเข้ากับขาเข้า', 'Cannot connect two inputs; connect an output to an input');
  }
  if (ka.width !== kb.width) {
    return fail(`ขาทั้งสองกว้างไม่เท่ากัน (${ka.width} บิต กับ ${kb.width} บิต)`, `Pin widths differ (${ka.width} vs ${kb.width} bits)`);
  }
  const from = ka.role === 'source' ? a : b;
  const to = ka.role === 'source' ? b : a;
  const bd = body(def);
  if (bd.wires.some((w) => sameRef(w.from, from) && sameRef(w.to, to))) {
    return fail('สองขานี้ต่อกันอยู่แล้ว', 'These pins are already connected');
  }
  if (bd.wires.some((w) => sameRef(w.to, to))) {
    return fail('ขาเข้านี้มีสายต่ออยู่แล้ว ขาเข้ารับสัญญาณได้จากที่เดียว', 'This input already has a wire; an input can have only one source');
  }
  const id = wireId ?? nextId(bd.wires.map((w) => w.id), 'w');
  const wire: Wire = { id, from: { ...from }, to: { ...to } };
  return { ok: true, def: withBody(def, { ...bd, wires: [...bd.wires, wire] }), wireId: id };
}

/**
 * เปลี่ยน params ของชิ้น (เช่นความกว้างของตัวแยกบัส) สายที่ต่อกับขาที่หายไปหรือกว้างไม่เท่าเดิมถูกถอดออก
 * ถ้า params ใช้ไม่ได้ (pinsOf โยน error) คืน ok: false
 */
export function setParams(
  def: ComponentDef,
  id: string,
  params: Record<string, number>,
  pinsOf: PinResolver,
): OpResult & { removedWires?: string[] } {
  const bd = body(def);
  const inst = bd.instances.find((i) => i.id === id);
  if (!inst) return fail(`ไม่มีชิ้นส่วน "${id}"`, `No instance "${id}"`);
  let before: PinDef[] | undefined;
  let after: PinDef[] | undefined;
  try {
    before = pinsOf(inst.defId, inst.params);
    after = pinsOf(inst.defId, params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`ตั้งค่านี้ไม่ได้: ${msg}`, `Invalid setting: ${msg}`);
  }
  if (!after) return fail(`ไม่รู้จักชิ้นส่วน "${inst.defId}"`, `Unknown component "${inst.defId}"`);
  const widthBefore = new Map((before ?? []).map((p) => [p.name, p.width]));
  const widthAfter = new Map(after.map((p) => [p.name, p.width]));
  const keep = (pin: string): boolean => widthAfter.has(pin) && widthAfter.get(pin) === widthBefore.get(pin);
  const removed = bd.wires.filter((w) => (w.from.inst === id && !keep(w.from.pin)) || (w.to.inst === id && !keep(w.to.pin)));
  const gone = new Set(removed.map((w) => w.id));
  return {
    ok: true,
    def: withBody(def, {
      ...bd,
      instances: bd.instances.map((i) => (i.id === id ? { ...i, params: { ...params } } : i)),
      wires: bd.wires.filter((w) => !gone.has(w.id)),
    }),
    removedWires: removed.map((w) => w.id),
  };
}

/** ชิ้นส่วนที่ถูกใช้อยู่ในวงจรนี้กี่ตัว (ใช้แสดงจำนวน NAND ระดับบนสุด) */
export function countByDef(def: ComponentDef): Map<string, number> {
  const counts = new Map<string, number>();
  for (const i of body(def).instances) counts.set(i.defId, (counts.get(i.defId) ?? 0) + 1);
  return counts;
}

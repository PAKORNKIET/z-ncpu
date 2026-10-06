import { ComponentLibrary, testComponent } from '@z-ncpu/engine';
import type { ComponentDef } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { Editor, History, nextId } from '../src';

const lib = new ComponentLibrary();
const pinsOf = lib.pinsOf.bind(lib);

const emptyNot = (): ComponentDef => ({
  id: 'user.not',
  name: { th: 'NOT', en: 'NOT' },
  kind: 'circuit',
  pins: [
    { name: 'a', dir: 'in', width: 1 },
    { name: 'y', dir: 'out', width: 1 },
  ],
  body: { instances: [], wires: [] },
});

describe('Editor', () => {
  it('สร้าง NOT จาก NAND ด้วย editor แล้ววงจรผ่านเทสต์จริง', () => {
    const ed = new Editor(emptyNot(), pinsOf);
    const n = ed.add({ defId: 'prim.nand', x: 100, y: 100 });
    expect(n).toBe('nand1');
    // คลิกลำดับไหนก็ได้ ระบบจัดทิศให้เอง
    expect(ed.connect({ inst: n, pin: 'a' }, { inst: 'self', pin: 'a' })).toBe(true);
    expect(ed.connect({ inst: 'self', pin: 'a' }, { inst: n, pin: 'b' })).toBe(true);
    expect(ed.connect({ inst: n, pin: 'y' }, { inst: 'self', pin: 'y' })).toBe(true);
    const wires = ed.def.body!.wires;
    expect(wires.every((w) => w.from.inst === 'self' ? w.from.pin === 'a' : w.from.pin === 'y')).toBe(true);

    const userLib = new ComponentLibrary([ed.def]);
    const { report } = testComponent(userLib, 'user.not', {
      type: 'truth-table',
      rows: [
        { in: { a: 0 }, out: { y: 1 } },
        { in: { a: 1 }, out: { y: 0 } },
      ],
    });
    expect(report?.passed).toBe(true);
  });

  it.each([
    ['ขาออกกับขาออก', { inst: 'nand1', pin: 'y' }, { inst: 'self', pin: 'a' }, 'ต่อขาออกเข้ากับขาออกไม่ได้'],
    ['ขาเข้ากับขาเข้า', { inst: 'nand1', pin: 'a' }, { inst: 'self', pin: 'y' }, 'ต่อขาเข้ากับขาเข้าไม่ได้'],
    ['ขาเดียวกัน', { inst: 'nand1', pin: 'a' }, { inst: 'nand1', pin: 'a' }, 'ตัวเอง'],
    ['ขาที่ไม่มีอยู่', { inst: 'nand1', pin: 'z' }, { inst: 'self', pin: 'a' }, 'ไม่มีขา'],
  ])('ปฏิเสธการต่อสายที่ผิด: %s', (_n, a, b, msg) => {
    const ed = new Editor(emptyNot(), pinsOf);
    ed.add({ defId: 'prim.nand', x: 0, y: 0 });
    const before = ed.def;
    expect(ed.connect(a, b)).toBe(false);
    expect(ed.lastError?.th).toContain(msg);
    expect(ed.def).toBe(before);
  });

  it('ขาเข้ารับได้สายเดียว และความกว้างต้องเท่ากัน', () => {
    const def = emptyNot();
    def.pins.push({ name: 'bus', dir: 'in', width: 4 });
    const ed = new Editor(def, pinsOf);
    ed.add({ defId: 'prim.nand', x: 0, y: 0 });
    expect(ed.connect({ inst: 'self', pin: 'a' }, { inst: 'nand1', pin: 'a' })).toBe(true);
    expect(ed.connect({ inst: 'self', pin: 'a' }, { inst: 'nand1', pin: 'a' })).toBe(false);
    expect(ed.lastError?.th).toContain('ต่อกันอยู่แล้ว');
    expect(ed.connect({ inst: 'nand1', pin: 'y' }, { inst: 'nand1', pin: 'a' })).toBe(false);
    expect(ed.lastError?.th).toContain('รับสัญญาณได้จากที่เดียว');
    expect(ed.connect({ inst: 'self', pin: 'bus' }, { inst: 'nand1', pin: 'b' })).toBe(false);
    expect(ed.lastError?.th).toContain('4 บิต กับ 1 บิต');
  });

  it('ลบชิ้นส่วนแล้วสายที่ต่ออยู่หายไปด้วย และ undo กลับมาครบ', () => {
    const ed = new Editor(emptyNot(), pinsOf);
    const n = ed.add({ defId: 'prim.nand', x: 0, y: 0 });
    ed.connect({ inst: 'self', pin: 'a' }, { inst: n, pin: 'a' });
    ed.connect({ inst: n, pin: 'y' }, { inst: 'self', pin: 'y' });
    const full = ed.def;
    ed.select({ instances: [n] });
    ed.deleteSelection();
    expect(ed.def.body!.instances).toHaveLength(0);
    expect(ed.def.body!.wires).toHaveLength(0);
    ed.undo();
    expect(ed.def).toBe(full);
    ed.redo();
    expect(ed.def.body!.wires).toHaveLength(0);
  });

  it('การลากหนึ่งครั้งรวมเป็น undo เดียว', () => {
    const ed = new Editor(emptyNot(), pinsOf);
    const n = ed.add({ defId: 'prim.nand', x: 0, y: 0 });
    for (let i = 0; i < 10; i++) ed.drag([n], 5, 2);
    ed.endDrag();
    expect(ed.def.body!.instances[0]).toMatchObject({ x: 50, y: 20 });
    ed.undo();
    expect(ed.def.body!.instances[0]).toMatchObject({ x: 0, y: 0 });
    ed.drag([n], 1, 1);
    ed.endDrag();
    ed.drag([n], 1, 1);
    ed.endDrag();
    ed.undo();
    expect(ed.def.body!.instances[0]).toMatchObject({ x: 1, y: 1 });
  });

  it('หมุนครบ 4 ครั้งกลับที่เดิม และตั้งชื่อ/ลบชื่อได้', () => {
    const ed = new Editor(emptyNot(), pinsOf);
    const n = ed.add({ defId: 'prim.nand', x: 0, y: 0 });
    const rotations = [1, 2, 3, 4].map(() => {
      ed.rotate([n]);
      return ed.def.body!.instances[0]!.rotation;
    });
    expect(rotations).toEqual([90, 180, 270, 0]);
    ed.label(n, '  ตัวกลับค่า ');
    expect(ed.def.body!.instances[0]!.label).toBe('ตัวกลับค่า');
    ed.label(n, '');
    expect(ed.def.body!.instances[0]!.label).toBeUndefined();
  });

  it('ไม่แก้ ComponentDef ตัวเดิม (immutable)', () => {
    const start = emptyNot();
    const snapshot = JSON.stringify(start);
    const ed = new Editor(start, pinsOf);
    const n = ed.add({ defId: 'prim.nand', x: 0, y: 0 });
    ed.drag([n], 10, 10);
    ed.connect({ inst: 'self', pin: 'a' }, { inst: n, pin: 'a' });
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe('History', () => {
  it('ทำใหม่หลัง undo ล้าง redo และจำกัดจำนวนประวัติ', () => {
    const h = new History(0, 3);
    for (const v of [1, 2, 3, 4, 5]) h.push(v, `ตั้งเป็น ${v}`);
    expect(h.undoLabel).toBe('ตั้งเป็น 5');
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(3);
    expect(h.state).toBe(2);
    h.redo();
    h.push(99, 'ใหม่');
    expect(h.canRedo).toBe(false);
  });
});

it('nextId ไม่ชนกับ id เดิม', () => {
  expect(nextId(['nand1', 'nand2'], 'prim.nand')).toBe('nand3');
  expect(nextId([], 'user.xor')).toBe('xor1');
});

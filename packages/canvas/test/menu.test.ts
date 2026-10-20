// เมนูคลิกขวา, คัดลอก/วาง และทำสำเนา (ไม่ต้องมีเบราว์เซอร์)
import { ComponentLibrary } from '@z-ncpu/engine';
import type { ComponentDef } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { buildScene, copyParts, Editor, Interaction, pasteParts, toScreen, type Point } from '../src';

const lib = new ComponentLibrary();
const pinsOf = lib.pinsOf.bind(lib);

/** NOT จาก NAND สองตัวต่อกัน: n1 → n2 และขาของวงจร */
const circuit = (): ComponentDef => ({
  id: 'user.sandbox',
  name: { th: 'ทดลอง', en: 'Sandbox' },
  kind: 'circuit',
  pins: [
    { name: 'a', dir: 'in', width: 1 },
    { name: 'y', dir: 'out', width: 1 },
  ],
  body: {
    instances: [
      { id: 'n1', defId: 'prim.nand', x: 100, y: 0, rotation: 0 },
      { id: 'n2', defId: 'prim.nand', x: 300, y: 0, rotation: 90 },
    ],
    wires: [
      { id: 'w1', from: { inst: 'self', pin: 'a' }, to: { inst: 'n1', pin: 'a' } },
      { id: 'w2', from: { inst: 'n1', pin: 'y' }, to: { inst: 'n2', pin: 'a' } },
      { id: 'w3', from: { inst: 'n2', pin: 'y' }, to: { inst: 'self', pin: 'y' } },
    ],
  },
});

function setup(def = circuit(), options: { readOnly?: boolean; canPlace?: (defId: string) => boolean } = {}) {
  const editor = new Editor(def, pinsOf);
  const ui = new Interaction(editor, { scene: () => buildScene(editor.def, { pinsOf }), ...options });
  ui.setCamera({ x: -100, y: -200, zoom: 1 });
  const at = (x: number, y: number): Point => toScreen(ui.camera, { x, y });
  return { editor, ui, at };
}

describe('คัดลอกและวาง (ops)', () => {
  it('คัดลอกเฉพาะสายที่ต่อกันเองระหว่างชิ้นที่เลือก และวางด้วยชื่อใหม่', () => {
    const def = circuit();
    const clip = copyParts(def, ['n1', 'n2'])!;
    expect(clip.instances.map((i) => i.id)).toEqual(['n1', 'n2']);
    expect(clip.wires).toEqual([{ from: { inst: 'n1', pin: 'y' }, to: { inst: 'n2', pin: 'a' } }]);
    const r = pasteParts(def, clip, 0, 200);
    expect(r.ids).toEqual(['nand1', 'nand2']);
    const added = r.def.body!.instances.slice(2);
    expect(added).toEqual([
      { id: 'nand1', defId: 'prim.nand', x: 100, y: 200, rotation: 0 },
      { id: 'nand2', defId: 'prim.nand', x: 300, y: 200, rotation: 90 },
    ]);
    expect(r.def.body!.wires.at(-1)).toEqual({ id: 'w4', from: { inst: 'nand1', pin: 'y' }, to: { inst: 'nand2', pin: 'a' } });
    // ของเดิมไม่ถูกแก้
    expect(def.body!.instances).toHaveLength(2);
    expect(copyParts(def, [])).toBeNull();
  });

  it('ชิ้นที่ใช้ในวงจรนี้ไม่ได้ถูกข้าม พร้อมสายที่ต่อกับมัน', () => {
    const clip = copyParts(circuit(), ['n1', 'n2'])!;
    clip.instances[1]!.defId = 'user.secret';
    const r = pasteParts(circuit(), clip, 0, 100, (d) => d !== 'user.secret');
    expect(r.ids).toEqual(['nand1']);
    expect(r.skipped).toBe(1);
    expect(r.def.body!.wires).toHaveLength(3);
  });
});

describe('เมนูคลิกขวา', () => {
  it('บอกว่าใต้เมาส์มีอะไร และเลือกชิ้น/สายนั้นให้ (ถ้ายังไม่ได้เลือก)', () => {
    const { editor, ui, at } = setup();
    const t1 = ui.contextAt(at(100, 0));
    expect(t1).toEqual({ kind: 'instance', id: 'n1', defId: 'prim.nand', count: 1 });
    expect(editor.selection.instances).toEqual(['n1']);
    // เลือกไว้หลายชิ้นแล้วคลิกขวาที่ชิ้นหนึ่งในนั้น: ยังเลือกทั้งหมดอยู่
    editor.select({ instances: ['n1', 'n2'] });
    expect(ui.contextAt(at(100, 0))).toMatchObject({ kind: 'instance', count: 2 });
    expect(editor.selection.instances).toEqual(['n1', 'n2']);

    const pin = ui.pinOnScreen({ inst: 'n1', pin: 'y' })!;
    expect(ui.contextAt(pin)).toEqual({ kind: 'pin', ref: { inst: 'n1', pin: 'y' } });
    const empty = ui.contextAt(at(800, 600));
    expect(empty).toEqual({ kind: 'empty', world: { x: 800, y: 600 } });
  });

  it('ลากปุ่มขวาเพื่อเลื่อนจอแล้วปล่อย ไม่เปิดเมนู', () => {
    const { ui, at } = setup();
    const a = at(800, 600);
    ui.pointerDown({ ...a, button: 2 });
    ui.pointerMove({ x: a.x + 50, y: a.y, button: 2 });
    ui.pointerUp({ x: a.x + 50, y: a.y, button: 2 });
    expect(ui.contextAt({ x: a.x + 50, y: a.y })).toBeNull();
    // ครั้งต่อไปคลิกขวาเฉยๆ เปิดได้ตามปกติ
    ui.pointerDown({ ...a, button: 2 });
    ui.pointerUp({ ...a, button: 2 });
    expect(ui.contextAt(a)).not.toBeNull();
  });
});

describe('Ctrl+C / Ctrl+V / Ctrl+D', () => {
  it('คัดลอกแล้ววางที่เมาส์ วางซ้ำโดยไม่ขยับเมาส์จะเยื้องออกไป และ undo ทีละครั้ง', () => {
    const { editor, ui, at } = setup();
    editor.select({ instances: ['n1', 'n2'] });
    expect(ui.key({ key: 'c', ctrl: true })).toBe(true);
    expect(ui.hasClipboard).toBe(true);
    ui.pointerMove({ ...at(500, 400), button: 0 });
    expect(ui.key({ key: 'v', ctrl: true })).toBe(true);
    const placed = () => editor.def.body!.instances.slice(2).map((i) => [i.id, i.x, i.y]);
    expect(placed()).toEqual([
      ['nand1', 500, 400],
      ['nand2', 700, 400],
    ]);
    expect(editor.selection.instances).toEqual(['nand1', 'nand2']);
    ui.key({ key: 'v', ctrl: true });
    expect(placed().slice(2)).toEqual([
      ['nand3', 540, 440],
      ['nand4', 740, 440],
    ]);
    expect(editor.history.undoLabel).toBe('วาง 2 ชิ้น');
    editor.undo();
    editor.undo();
    expect(editor.def.body!.instances).toHaveLength(2);
  });

  it('วางจากเมนูที่ตำแหน่งที่คลิกขวา และทำสำเนาเยื้องจากของเดิม', () => {
    const { editor, ui, at } = setup();
    editor.select({ instances: ['n2'] });
    ui.copy();
    expect(ui.paste(at(0, 300))).toBe(true);
    expect(editor.def.body!.instances.at(-1)).toMatchObject({ x: 0, y: 300, rotation: 90 });
    editor.select({ instances: ['n1'] });
    expect(ui.key({ key: 'd', ctrl: true })).toBe(true);
    expect(editor.def.body!.instances.at(-1)).toMatchObject({ defId: 'prim.nand', x: 140, y: 40 });
    expect(editor.selection.instances).toEqual([editor.def.body!.instances.at(-1)!.id]);
    // ไม่ได้เลือกอะไร: Ctrl+C / Ctrl+D ไม่ทำอะไร (ปล่อยให้เบราว์เซอร์ใช้ปุ่มตามปกติ)
    editor.clearSelection();
    expect(ui.key({ key: 'c', ctrl: true })).toBe(false);
    expect(ui.key({ key: 'd', ctrl: true })).toBe(false);
  });

  it('ดูอย่างเดียว (X-Ray) วางไม่ได้ และชิ้นที่ด่านไม่อนุญาตบอกเหตุผล', () => {
    const src = setup();
    src.editor.select({ instances: ['n1'] });
    src.ui.copy();
    const ro = setup(circuit(), { readOnly: true });
    expect(ro.ui.paste()).toBe(false);
    expect(ro.ui.key({ key: 'v', ctrl: true })).toBe(false);
    const strict = setup(circuit(), { canPlace: () => false });
    expect(strict.ui.paste()).toBe(false);
    expect(strict.editor.lastError?.th).toBe('ชิ้นที่คัดลอกไว้ใช้ในวงจรนี้ไม่ได้');
  });
});

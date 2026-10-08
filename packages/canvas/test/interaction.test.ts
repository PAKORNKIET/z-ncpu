// ทดสอบหน้าจอ editor โดยไม่ต้องมีเบราว์เซอร์: geometry, scene, hit test และการโต้ตอบด้วยเมาส์/คีย์บอร์ด
import { ComponentLibrary, testComponent } from '@z-ncpu/engine';
import type { ComponentDef, PinRef } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import {
  buildScene,
  Editor,
  fitCamera,
  GRID,
  hitTest,
  Interaction,
  nodeShape,
  pinKey,
  rotate,
  route,
  toScreen,
  toWorld,
  zoomAt,
  type Point,
} from '../src';

const lib = new ComponentLibrary();
const pinsOf = lib.pinsOf.bind(lib);

const sandbox = (): ComponentDef => ({
  id: 'user.sandbox',
  name: { th: 'ทดลอง', en: 'Sandbox' },
  kind: 'circuit',
  pins: [
    { name: 'a', dir: 'in', width: 1 },
    { name: 'b', dir: 'in', width: 1 },
    { name: 'y', dir: 'out', width: 1 },
  ],
  body: { instances: [], wires: [] },
});

function setup(def = sandbox()) {
  const editor = new Editor(def, pinsOf);
  const toggled: string[] = [];
  let changes = 0;
  const ui = new Interaction(editor, {
    scene: () => buildScene(editor.def, { pinsOf }),
    onToggleInput: (pin) => toggled.push(pin),
    onChange: () => changes++,
  });
  ui.setCamera({ x: -100, y: -200, zoom: 1 });
  const screenOf = (ref: PinRef): Point => ui.pinOnScreen(ref)!;
  const click = (p: Point, shift = false) => {
    ui.pointerDown({ ...p, button: 0, shift });
    ui.pointerUp({ ...p, button: 0, shift });
  };
  const drag = (a: Point, b: Point, button = 0, shift = false) => {
    ui.pointerDown({ ...a, button, shift });
    ui.pointerMove({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, button, shift });
    ui.pointerMove({ ...b, button, shift });
    ui.pointerUp({ ...b, button, shift });
  };
  return { editor, ui, toggled, screenOf, click, drag, changes: () => changes };
}

describe('geometry', () => {
  it('NAND: ขาเข้าซ้าย ขาออกขวา อยู่บนกริดทุกขา', () => {
    const s = nodeShape(pinsOf('prim.nand')!);
    expect(s.pins.map((p) => [p.name, p.dx, p.dy])).toEqual([
      ['a', -40, -20],
      ['b', -40, 20],
      ['y', 40, 0],
    ]);
    for (const p of s.pins) {
      expect(Math.abs(p.dx % GRID)).toBe(0);
      expect(Math.abs(p.dy % GRID)).toBe(0);
    }
  });

  it('หมุน 4 ครั้งกลับที่เดิม', () => {
    let p = { x: 40, y: -20 };
    for (let i = 0; i < 4; i++) p = rotate(p, 90);
    expect(p).toEqual({ x: 40, y: -20 });
    expect(rotate({ x: 40, y: 0 }, 90)).toEqual({ x: 0, y: 40 });
  });

  it('แปลงพิกัดจอ ↔ โลกกลับไปกลับมาได้ และซูมแล้วจุดใต้เมาส์อยู่ที่เดิม', () => {
    const cam = { x: 30, y: -50, zoom: 1.5 };
    const w = { x: 123, y: 45 };
    const back = toWorld(cam, toScreen(cam, w));
    expect(back.x).toBeCloseTo(w.x);
    expect(back.y).toBeCloseTo(w.y);
    const mouse = { x: 200, y: 150 };
    const before = toWorld(cam, mouse);
    const after = toWorld(zoomAt(cam, mouse, 2), mouse);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomAt(cam, mouse, 1000).zoom).toBe(4);
  });

  it('fitCamera ให้เห็นทั้งกรอบ', () => {
    const cam = fitCamera({ x: 0, y: 0, w: 1000, h: 500 }, 800, 600);
    const tl = toScreen(cam, { x: 0, y: 0 });
    const br = toScreen(cam, { x: 1000, y: 500 });
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(800);
    expect(tl.y).toBeGreaterThanOrEqual(0);
    expect(br.y).toBeLessThanOrEqual(600);
  });

  it('สายหักมุมฉาก', () => {
    const pts = route({ pos: { x: 0, y: 0 }, normal: { x: 1, y: 0 } }, { pos: { x: 100, y: 40 }, normal: { x: -1, y: 0 } });
    expect(pts).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it('ปลายทางอยู่ข้างหลังต้นทาง: สายอ้อมออกไปก่อน ไม่ทะลุกล่อง', () => {
    // ขาออกของชิ้นบนไปขาเข้าของชิ้นที่อยู่ข้างล่างตรงๆ (x ของขาเข้าน้อยกว่าขาออก)
    const pts = route({ pos: { x: 40, y: 0 }, normal: { x: 1, y: 0 } }, { pos: { x: -40, y: 120 }, normal: { x: -1, y: 0 } });
    expect(pts).toEqual([
      { x: 40, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 60 },
      { x: -60, y: 60 },
      { x: -60, y: 120 },
      { x: -40, y: 120 },
    ]);
    // ทุกส่วนเป็นเส้นแนวตั้งหรือแนวนอน
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.x === pts[i - 1]!.x || pts[i]!.y === pts[i - 1]!.y).toBe(true);
  });
});

describe('scene', () => {
  it('มีขาของวงจรและขาของชิ้นส่วน และหมุนชิ้นแล้วขาย้ายตาม', () => {
    const ed = new Editor(sandbox(), pinsOf);
    const id = ed.add({ defId: 'prim.nand', x: 200, y: 0 });
    let scene = buildScene(ed.def, { pinsOf });
    expect(scene.nodes.map((n) => n.id)).toEqual(['self.a', 'self.b', 'self.y', id]);
    expect(scene.pins.get(pinKey({ inst: id, pin: 'y' }))!.pos).toEqual({ x: 240, y: 0 });
    ed.rotate([id]);
    scene = buildScene(ed.def, { pinsOf });
    expect(scene.pins.get(pinKey({ inst: id, pin: 'y' }))!.pos).toEqual({ x: 200, y: 40 });
    expect(scene.nodes[3]!.rect).toMatchObject({ w: 80, h: 80 });
  });

  it('hit test: ขามาก่อนกล่อง กล่องมาก่อนสาย', () => {
    const ed = new Editor(sandbox(), pinsOf);
    const id = ed.add({ defId: 'prim.nand', x: 200, y: 0 });
    ed.connect({ inst: id, pin: 'y' }, { inst: 'self', pin: 'y' });
    const scene = buildScene(ed.def, { pinsOf });
    expect(hitTest(scene, { x: 241, y: 1 })).toMatchObject({ kind: 'pin', pin: { ref: { inst: id, pin: 'y' } } });
    expect(hitTest(scene, { x: 200, y: 0 })).toMatchObject({ kind: 'node', node: { id } });
    expect(hitTest(scene, { x: 400, y: 0 })).toMatchObject({ kind: 'wire' });
    expect(hitTest(scene, { x: 400, y: 300 })).toBeNull();
  });

  it('ชิ้นส่วนที่ไม่รู้จักยังวาดได้ (ทำเครื่องหมายว่าเสีย)', () => {
    const def = sandbox();
    def.body!.instances.push({ id: 'q', defId: 'user.missing', x: 0, y: 0, rotation: 0 });
    const n = buildScene(def, { pinsOf }).nodes.find((x) => x.id === 'q')!;
    expect(n.broken).toBe(true);
    expect(n.title).toBe('?');
  });
});

describe('Interaction', () => {
  it('วาง NAND ต่อสายด้วยการลาก แล้วได้ NOT ที่ผ่านเทสต์', () => {
    const def = sandbox();
    def.pins = def.pins.filter((p) => p.name !== 'b');
    const { editor, ui, screenOf, drag, click } = setup(def);

    ui.beginPlace({ defId: 'prim.nand' });
    const at = toScreen(ui.camera, { x: 300, y: 0 });
    ui.pointerMove({ ...at, button: 0 });
    expect(ui.overlay().placing?.center).toEqual({ x: 300, y: 0 });
    click(at);
    expect(ui.placing).toBeNull();
    const n = editor.def.body!.instances[0]!.id;

    // ลากจากขาเข้าของวงจรไปขา a และ b, ลากจากขาออกของ NAND ไปขาออกของวงจร
    drag(screenOf({ inst: 'self', pin: 'a' }), screenOf({ inst: n, pin: 'a' }));
    drag(screenOf({ inst: n, pin: 'b' }), screenOf({ inst: 'self', pin: 'a' }));
    drag(screenOf({ inst: n, pin: 'y' }), screenOf({ inst: 'self', pin: 'y' }));
    expect(editor.def.body!.wires).toHaveLength(3);

    const { report } = testComponent(new ComponentLibrary([{ ...editor.def, id: 'user.not' }]), 'user.not', {
      type: 'truth-table',
      rows: [
        { in: { a: 0 }, out: { y: 1 } },
        { in: { a: 1 }, out: { y: 0 } },
      ],
    });
    expect(report?.passed).toBe(true);
  });

  it('ต่อสายแบบคลิกทีละขา และระหว่างนั้นไฮไลต์ขาที่ต่อได้', () => {
    const { editor, ui, screenOf, click } = setup();
    const n = editor.add({ defId: 'prim.nand', x: 300, y: 0 });
    click(screenOf({ inst: 'self', pin: 'a' }));
    expect(ui.wiring).toBe(true);
    ui.pointerMove({ ...screenOf({ inst: n, pin: 'a' }), button: 0 });
    const o = ui.overlay();
    expect(o.ghostWire?.valid).toBe(true);
    // ขาเข้าของ NAND ต่อได้ ขาออกของวงจร (y) ก็ต่อได้ แต่ขาเข้าอีกขาของวงจร (b) ต่อไม่ได้
    expect(o.targets?.map(pinKey).sort()).toEqual([`${n}.a`, `${n}.b`, 'self.y']);
    click(screenOf({ inst: n, pin: 'a' }));
    expect(ui.wiring).toBe(false);
    expect(editor.def.body!.wires).toEqual([{ id: 'w1', from: { inst: 'self', pin: 'a' }, to: { inst: n, pin: 'a' } }]);
    // ต่อขา a ไปแล้ว ครั้งต่อไปขา a ไม่ใช่เป้าหมายแล้ว
    click(screenOf({ inst: 'self', pin: 'b' }));
    ui.pointerMove({ ...screenOf({ inst: n, pin: 'a' }), button: 0 });
    expect(ui.overlay().targets?.map(pinKey).sort()).toEqual([`${n}.b`, 'self.y']);
    expect(ui.overlay().ghostWire?.valid).toBe(false);
  });

  it('ต่อขาเข้ากับขาเข้าไม่ได้ และมีข้อความบอกเหตุผล', () => {
    const { editor, ui, screenOf, drag } = setup();
    const n = editor.add({ defId: 'prim.nand', x: 300, y: 0 });
    ui.pointerDown({ ...screenOf({ inst: n, pin: 'a' }), button: 0 });
    ui.pointerMove({ ...screenOf({ inst: n, pin: 'b' }), button: 0 });
    expect(ui.overlay().ghostWire?.valid).toBe(false);
    ui.pointerUp({ ...screenOf({ inst: n, pin: 'b' }), button: 0 });
    expect(editor.def.body!.wires).toHaveLength(0);
    expect(editor.lastError?.th).toMatch(/ขาเข้ากับขาเข้า/);
    // เริ่มทำอย่างอื่น ข้อความหายไป
    drag(screenOf({ inst: 'self', pin: 'a' }), screenOf({ inst: n, pin: 'a' }));
    expect(editor.lastError).toBeUndefined();
  });

  it('ลากชิ้นส่วนแล้วติดกริด และ undo ทีเดียวกลับที่เดิม', () => {
    const { editor, ui, drag } = setup();
    const n = editor.add({ defId: 'prim.nand', x: 300, y: 0 });
    const from = toScreen(ui.camera, { x: 300, y: 0 });
    drag(from, { x: from.x + 47, y: from.y + 13 });
    expect(editor.def.body!.instances[0]).toMatchObject({ id: n, x: 340, y: 20 });
    expect(editor.selection.instances).toEqual([n]);
    expect(ui.key({ key: 'z', ctrl: true })).toBe(true);
    expect(editor.def.body!.instances[0]).toMatchObject({ x: 300, y: 0 });
  });

  it('ลากที่ว่างเพื่อเลื่อนจอ และคลิกที่ว่างเพื่อยกเลิกการเลือก', () => {
    const { editor, ui, drag, click } = setup();
    const n = editor.add({ defId: 'prim.nand', x: 300, y: 0 });
    expect(editor.selection.instances).toEqual([n]);
    const cam = ui.camera;
    drag({ x: 600, y: 500 }, { x: 650, y: 480 });
    expect(ui.camera.x).toBeCloseTo(cam.x - 50);
    expect(ui.camera.y).toBeCloseTo(cam.y + 20);
    expect(editor.selection.instances).toEqual([n]);
    click({ x: 600, y: 500 });
    expect(editor.selection.instances).toEqual([]);
    // ปุ่มกลางลากบนชิ้นส่วนก็เลื่อนจอ ไม่ย้ายชิ้น
    const on = toScreen(ui.camera, { x: 300, y: 0 });
    drag(on, { x: on.x + 100, y: on.y }, 1);
    expect(editor.def.body!.instances[0]).toMatchObject({ x: 300, y: 0 });
  });

  it('Shift + ลากที่ว่าง = เลือกด้วยกรอบ แล้วกด Delete ลบทั้งหมด', () => {
    const { editor, ui, drag } = setup();
    editor.add({ defId: 'prim.nand', x: 300, y: 0 });
    editor.add({ defId: 'prim.nand', x: 300, y: 120 });
    editor.add({ defId: 'prim.nand', x: 600, y: 0 });
    editor.clearSelection();
    drag(toScreen(ui.camera, { x: 240, y: -60 }), toScreen(ui.camera, { x: 380, y: 180 }), 0, true);
    expect(editor.selection.instances).toEqual(['nand1', 'nand2']);
    expect(ui.key({ key: 'Delete' })).toBe(true);
    expect(editor.def.body!.instances.map((i) => i.id)).toEqual(['nand3']);
  });

  it('คลิกขาเข้าของวงจรเพื่อสลับค่า', () => {
    const { ui, toggled, click } = setup();
    click(toScreen(ui.camera, { x: -10, y: -40 }));
    expect(toggled).toEqual(['a']);
  });

  it('ลากขาเข้า/ขาออกของวงจรไปไว้ที่อื่นได้ (ไม่สลับค่า) undo ได้ และสายยังต่ออยู่', () => {
    const { editor, ui, toggled, drag } = setup();
    const scene0 = buildScene(editor.def, { pinsOf });
    const a0 = scene0.nodes.find((n) => n.id === 'self.a')!.center;
    const y0 = scene0.nodes.find((n) => n.id === 'self.y')!.center;
    const wires = editor.def.body!.wires.length;
    drag(toScreen(ui.camera, { x: a0.x - 10, y: a0.y }), toScreen(ui.camera, { x: a0.x - 10 + 100, y: a0.y + 60 }));
    expect(toggled).toEqual([]);
    expect(editor.def.body!.terminals!.a).toEqual({ x: a0.x + 100, y: a0.y + 60 });
    drag(toScreen(ui.camera, y0), toScreen(ui.camera, { x: y0.x - 200, y: y0.y }));
    const scene1 = buildScene(editor.def, { pinsOf });
    expect(scene1.nodes.find((n) => n.id === 'self.y')!.center).toEqual({ x: y0.x - 200, y: y0.y });
    expect(editor.def.body!.wires.length).toBe(wires);
    // ขาที่ย้ายไม่เข้าไปอยู่ในชิ้นที่เลือก (กดลบแล้วไม่หาย)
    expect(editor.selection.instances).not.toContain('self.y');
    ui.key({ key: 'z', ctrl: true });
    expect(buildScene(editor.def, { pinsOf }).nodes.find((n) => n.id === 'self.y')!.center).toEqual(y0);
  });

  it('ขอบเหลือง: ขึ้นเฉพาะตอนกำลังลากย้าย แตะเฉยๆ ไม่ขึ้น และหายเมื่อปล่อย', () => {
    const { editor, ui } = setup();
    const a = buildScene(editor.def, { pinsOf }).nodes.find((n) => n.id === 'self.a')!.center;
    const p = toScreen(ui.camera, { x: a.x - 10, y: a.y });
    ui.pointerDown({ ...p, button: 0 });
    expect(ui.overlay().dragging).toBeUndefined();
    ui.pointerMove({ x: p.x + 60, y: p.y + 40, button: 0 });
    expect(ui.overlay().dragging).toEqual(['self.a']);
    ui.pointerUp({ x: p.x + 60, y: p.y + 40, button: 0 });
    expect(ui.overlay().dragging).toBeUndefined();
  });

  it('คีย์ลัด: R หมุน, Ctrl+Y redo, Esc ยกเลิก, ปุ่มอื่นไม่ยุ่ง', () => {
    const { editor, ui } = setup();
    editor.add({ defId: 'prim.nand', x: 300, y: 0 });
    expect(ui.key({ key: 'R' })).toBe(true);
    expect(editor.def.body!.instances[0]!.rotation).toBe(90);
    ui.key({ key: 'z', ctrl: true });
    expect(editor.def.body!.instances[0]!.rotation).toBe(0);
    ui.key({ key: 'y', ctrl: true });
    expect(editor.def.body!.instances[0]!.rotation).toBe(90);
    ui.beginPlace({ defId: 'prim.nand' });
    expect(ui.key({ key: 'Escape' })).toBe(true);
    expect(ui.placing).toBeNull();
    expect(ui.key({ key: 'q' })).toBe(false);
  });

  it('ล้อเมาส์ซูมเข้าออกได้ในขอบเขต', () => {
    const { ui } = setup();
    for (let i = 0; i < 50; i++) ui.wheel({ x: 100, y: 100 }, -300);
    expect(ui.camera.zoom).toBe(4);
    for (let i = 0; i < 50; i++) ui.wheel({ x: 100, y: 100 }, 300);
    expect(ui.camera.zoom).toBe(0.25);
  });

  it('สองนิ้ว: ซูมและเลื่อนพร้อมกัน จุดใต้นิ้วตามนิ้วไป', () => {
    const { ui } = setup();
    const from = { x: 200, y: 150 };
    const under = toWorld(ui.camera, from);
    const zoom = ui.camera.zoom;
    ui.pinch(from, { x: 120, y: 90 }, 1.5);
    expect(ui.camera.zoom).toBeCloseTo(zoom * 1.5);
    const now = toScreen(ui.camera, under);
    expect(now.x).toBeCloseTo(120);
    expect(now.y).toBeCloseTo(90);
    // เลื่อนอย่างเดียว (ระยะนิ้วเท่าเดิม) เลื่อนเท่ากับที่นิ้วเลื่อนพอดี
    const before = toScreen(ui.camera, under);
    ui.pinch({ x: 120, y: 90 }, { x: 170, y: 60 }, 1);
    const after = toScreen(ui.camera, under);
    expect(after.x - before.x).toBeCloseTo(50);
    expect(after.y - before.y).toBeCloseTo(-30);
  });

  it('วางจากการลากปล่อย (drag & drop) ลงตำแหน่งที่ติดกริด', () => {
    const { editor, ui } = setup();
    const id = ui.dropAt(toScreen(ui.camera, { x: 207, y: 33 }), { defId: 'prim.const1' });
    expect(editor.def.body!.instances.find((i) => i.id === id)).toMatchObject({ defId: 'prim.const1', x: 200, y: 40 });
  });

  it('ดับเบิลคลิกชิ้นส่วนเพื่อดูข้างใน (X-Ray)', () => {
    const opened: string[] = [];
    const editor = new Editor(sandbox(), pinsOf);
    const ui = new Interaction(editor, { scene: () => buildScene(editor.def, { pinsOf }), onOpen: (id) => opened.push(id) });
    const n = editor.add({ defId: 'prim.nand', x: 300, y: 0 });
    expect(ui.doubleClick(toScreen(ui.camera, { x: 300, y: 0 }))).toBe(true);
    expect(ui.doubleClick(toScreen(ui.camera, { x: 300, y: 300 }))).toBe(false);
    expect(opened).toEqual([n]);
  });

  it('โหมดอ่านอย่างเดียว: เลือกและเลื่อนจอได้ แต่ต่อสาย ย้าย วาง ลบ สลับค่า ไม่ได้', () => {
    const def = sandbox();
    def.body!.instances.push({ id: 'n', defId: 'prim.nand', x: 300, y: 0, rotation: 0 });
    const editor = new Editor(def, pinsOf);
    const toggled: string[] = [];
    const ui = new Interaction(editor, {
      scene: () => buildScene(editor.def, { pinsOf }),
      readOnly: true,
      onToggleInput: (p) => toggled.push(p),
    });
    const before = editor.def;
    const at = (x: number, y: number) => toScreen(ui.camera, { x, y });
    const drag = (a: Point, b: Point) => {
      ui.pointerDown({ ...a, button: 0 });
      ui.pointerMove({ ...b, button: 0 });
      ui.pointerUp({ ...b, button: 0 });
    };
    drag(at(40, -40), at(260, -20)); // จากขาเข้า a ไปขา n.a
    const cam = ui.camera;
    drag(at(300, 0), at(400, 0)); // ลากชิ้น = เลื่อนจอ
    expect(ui.camera.x).toBeLessThan(cam.x);
    expect(editor.selection.instances).toEqual(['n']);
    ui.pointerDown({ ...toScreen(ui.camera, { x: -10, y: -40 }), button: 0 });
    ui.pointerUp({ ...toScreen(ui.camera, { x: -10, y: -40 }), button: 0 });
    ui.beginPlace({ defId: 'prim.nand' });
    expect(ui.placing).toBeNull();
    expect(ui.dropAt({ x: 10, y: 10 }, { defId: 'prim.nand' })).toBeUndefined();
    expect(ui.key({ key: 'Delete' })).toBe(false);
    expect(ui.key({ key: 'r' })).toBe(false);
    expect(ui.key({ key: 'z', ctrl: true })).toBe(false);
    expect(editor.def).toBe(before);
    expect(toggled).toEqual([]);
  });
});

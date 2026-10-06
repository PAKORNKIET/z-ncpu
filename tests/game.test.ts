// ระบบด่านและไฟล์บันทึก (M1-3): ปลดล็อก, ต้องทดสอบใหม่เมื่อแก้วงจร, และตรวจไฟล์ที่เปิดจากข้างนอก
import { ComponentLibrary, contentHash, testComponent } from '@z-ncpu/engine';
import type { ComponentDef } from '@z-ncpu/shared';
import { LEVELS } from '@z-ncpu/content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  availableParts,
  draftFor,
  firstUnfinished,
  isUnlocked,
  levelStatus,
  putComponent,
  recordTest,
  type HashOf,
} from '../apps/web/src/game/progress';
import { emptySave, loadSave, parseSave, serializeSave, storeSave, BACKUP_KEY, SAVE_KEY, type KeyValueStore } from '../apps/web/src/game/save';

const hashOf: HashOf = (components, id) => contentHash(new ComponentLibrary(components), id);
const solution = (id: string): ComponentDef =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'packages/content/solutions', `${id}.json`), 'utf8')) as ComponentDef;

/** เล่นด่านแบบเดียวกับที่แอปทำ: ทดสอบด้วย engine แล้วบันทึกผล */
function play(save: ReturnType<typeof emptySave>, levelId: string, def: ComponentDef) {
  const level = LEVELS.find((l) => l.id === levelId)!;
  let s = putComponent(save, def);
  const { report } = testComponent(new ComponentLibrary(s.components), def.id, level.tests, 'fast');
  s = recordTest(s, level.id, { passed: !!report?.passed, hash: hashOf(s.components, def.id), nand: 1 });
  return { save: s, passed: !!report?.passed };
}

describe('ระบบด่าน', () => {
  it('เริ่มต้น: เปิดแค่ด่านแรก และด่านแรกมีแค่ NAND ให้ใช้', () => {
    const s = emptySave();
    expect(isUnlocked(LEVELS, 0, s)).toBe(true);
    expect(isUnlocked(LEVELS, 1, s)).toBe(false);
    expect(levelStatus(LEVELS, 1, s, hashOf)).toBe('locked');
    expect(availableParts(LEVELS[0]!, LEVELS, s)).toEqual(['prim.nand']);
    expect(firstUnfinished(LEVELS, s)).toBe(0);
    expect(draftFor(LEVELS[0]!, s)).toMatchObject({ id: 'user.not', pins: LEVELS[0]!.target.pins, body: { instances: [] } });
  });

  it('ผ่าน NOT แล้ว: ด่าน AND เปิด และมี NOT ให้ใช้', () => {
    const { save, passed } = play(emptySave(), 'logic.not', solution('logic.not'));
    expect(passed).toBe(true);
    expect(levelStatus(LEVELS, 0, save, hashOf)).toBe('passed');
    expect(levelStatus(LEVELS, 1, save, hashOf)).toBe('open');
    expect(availableParts(LEVELS[1]!, LEVELS, save)).toEqual(['prim.nand', 'user.not']);
    expect(firstUnfinished(LEVELS, save)).toBe(1);
    expect(save.progress['logic.not']).toMatchObject({ attempts: 1, bestNand: 1 });
  });

  it('ตอบผิดไม่ปลดล็อก แต่นับจำนวนครั้ง', () => {
    const wrong = solution('logic.not');
    wrong.body!.wires = wrong.body!.wires.slice(0, 2); // ไม่ต่อขาออก
    const { save, passed } = play(emptySave(), 'logic.not', wrong);
    expect(passed).toBe(false);
    expect(save.progress['logic.not']).toEqual({ attempts: 1 });
    expect(isUnlocked(LEVELS, 1, save)).toBe(false);
  });

  it('แก้วงจรที่ผ่านแล้ว → ต้องทดสอบใหม่ แต่แค่ย้ายตำแหน่งไม่ต้อง', () => {
    let { save } = play(emptySave(), 'logic.not', solution('logic.not'));
    save = play(save, 'logic.and', solution('logic.and')).save;
    expect(levelStatus(LEVELS, 1, save, hashOf)).toBe('passed');

    const moved = structuredClone(save.components.find((c) => c.id === 'user.not')!);
    moved.body!.instances[0]!.x += 200;
    const s2 = putComponent(save, moved);
    expect(levelStatus(LEVELS, 0, s2, hashOf)).toBe('passed');
    expect(levelStatus(LEVELS, 1, s2, hashOf)).toBe('passed');

    const changed = structuredClone(moved);
    changed.body!.wires.pop();
    const s3 = putComponent(save, changed);
    expect(levelStatus(LEVELS, 0, s3, hashOf)).toBe('retest');
    // AND ใช้ NOT อยู่ข้างใน จึงต้องทดสอบใหม่ด้วย
    expect(levelStatus(LEVELS, 1, s3, hashOf)).toBe('retest');
    // ด่านที่เคยผ่านยังเปิดอยู่ ไม่ล็อกกลับ
    expect(isUnlocked(LEVELS, 1, s3)).toBe(true);
  });

  it('จำนวน NAND ที่ดีที่สุดเก็บค่าน้อยสุด', () => {
    let s = recordTest(emptySave(), 'logic.not', { passed: true, hash: 'a', nand: 5 });
    s = recordTest(s, 'logic.not', { passed: true, hash: 'b', nand: 3 });
    s = recordTest(s, 'logic.not', { passed: true, hash: 'c', nand: 4 });
    s = recordTest(s, 'logic.not', { passed: false, hash: 'd', nand: 1 });
    expect(s.progress['logic.not']).toEqual({ attempts: 4, passedHash: 'c', bestNand: 3 });
  });
});

describe('ไฟล์บันทึก', () => {
  it('บันทึกแล้วเปิดกลับได้เหมือนเดิม', () => {
    const { save } = play(emptySave(), 'logic.not', solution('logic.not'));
    const r = parseSave(serializeSave(save));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.components).toEqual(save.components);
      expect(r.save.progress).toEqual(save.progress);
    }
  });

  it.each([
    ['ไม่ใช่ JSON', '{oops', /JSON/],
    ['ไม่ใช่ไฟล์ Z-NCPU', '{"format":"other"}', /ไม่ใช่ไฟล์ของ Z-NCPU/],
    ['รุ่นไฟล์ใหม่กว่า', '{"format":"zncpu","schemaVersion":9}', /รุ่น 9/],
    ['id ไม่ขึ้นต้นด้วย user.', '{"format":"zncpu","schemaVersion":1,"components":[{"id":"prim.nand","name":{"th":"","en":""},"kind":"circuit","pins":[],"body":{"instances":[],"wires":[]}}]}', /รหัสชิ้นส่วน/],
    ['ชื่อชิ้นมีอักขระแปลก', '{"format":"zncpu","schemaVersion":1,"components":[{"id":"user.x","name":{"th":"","en":""},"kind":"circuit","pins":[],"body":{"instances":[{"id":"<img>","defId":"prim.nand","x":0,"y":0,"rotation":0}],"wires":[]}}]}', /อักษรที่ใช้ไม่ได้/],
    ['ความกว้าง pin เกิน', '{"format":"zncpu","schemaVersion":1,"components":[{"id":"user.x","name":{"th":"","en":""},"kind":"circuit","pins":[{"name":"a","dir":"in","width":99999}],"body":{"instances":[],"wires":[]}}]}', /ความกว้าง/],
    ['ตำแหน่งไม่ใช่ตัวเลข', '{"format":"zncpu","schemaVersion":1,"components":[{"id":"user.x","name":{"th":"","en":""},"kind":"circuit","pins":[],"body":{"instances":[{"id":"n","defId":"prim.nand","x":"1","y":0,"rotation":0}],"wires":[]}}]}', /ตำแหน่ง x/],
    ['ชิ้นซ้ำ', '{"format":"zncpu","schemaVersion":1,"components":[{"id":"user.x","name":{"th":"","en":""},"kind":"circuit","pins":[],"body":{"instances":[],"wires":[]}},{"id":"user.x","name":{"th":"","en":""},"kind":"circuit","pins":[],"body":{"instances":[],"wires":[]}}]}', /ซ้ำ/],
  ])('ปฏิเสธไฟล์ที่ไม่ถูกต้อง: %s', (_, text, reason) => {
    const r = parseSave(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });

  it('ตัดช่องที่ไม่รู้จักทิ้ง และกันการแก้ prototype', () => {
    const text =
      '{"format":"zncpu","schemaVersion":1,"evil":1,"progress":{"__proto__":{"attempts":1}},"components":[]}';
    const r = parseSave(text);
    expect(r.ok).toBe(false); // "__proto__" ไม่ใช่รหัสด่านที่ถูกต้อง
    const r2 = parseSave('{"format":"zncpu","schemaVersion":1,"evil":1,"components":[],"progress":{"logic.not":{"attempts":2,"hack":true}}}');
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect('evil' in r2.save).toBe(false);
      expect(r2.save.progress['logic.not']).toEqual({ attempts: 2 });
    }
    expect(({} as Record<string, unknown>).attempts).toBeUndefined();
  });

  it('ไฟล์ใหญ่เกินถูกปฏิเสธ', () => {
    const r = parseSave(' '.repeat(5_000_001));
    expect(r.ok).toBe(false);
  });

  it('localStorage: ข้อมูลเสียเริ่มใหม่และเก็บสำรอง, storage ใช้ไม่ได้ก็ยังเล่นได้', () => {
    const mem = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
    expect(loadSave(store).warning).toBeUndefined();
    const { save } = play(emptySave(), 'logic.not', solution('logic.not'));
    expect(storeSave(store, save)).toBe(true);
    expect(loadSave(store).save.progress).toEqual(save.progress);

    mem.set(SAVE_KEY, '{broken');
    const r = loadSave(store);
    expect(r.warning).toMatch(/เสีย/);
    expect(r.save.components).toEqual([]);
    expect(mem.get(BACKUP_KEY)).toBe('{broken');

    const denied: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadSave(denied).warning).toMatch(/ไม่ให้บันทึก/);
    expect(storeSave(denied, save)).toBe(false);
  });
});

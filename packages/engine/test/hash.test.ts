import type { ComponentDef } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { ComponentLibrary, contentHash, findDependents } from '../src';
import { referenceLibrary } from '../fixtures/reference';

const clone = (def: ComponentDef): ComponentDef => JSON.parse(JSON.stringify(def)) as ComponentDef;

describe('content hash (ข้อ 16)', () => {
  it('ย้ายตำแหน่งหรือหมุนชิ้น ไม่ทำให้ต้องทดสอบใหม่', () => {
    const lib = referenceLibrary();
    const before = contentHash(lib, 'user.xor');
    const moved = clone(lib.get('user.xor')!);
    moved.body!.instances.forEach((i) => {
      i.x += 500;
      i.rotation = 90;
      i.label = 'ย้ายแล้ว';
    });
    lib.add(moved);
    expect(contentHash(lib, 'user.xor')).toBe(before);
  });

  it('แก้ XOR แล้ว Adder และ Counter ที่ใช้ XOR อยู่ได้ hash ใหม่ แต่ OR ไม่เปลี่ยน', () => {
    const lib = referenceLibrary();
    const before = Object.fromEntries(['user.xor', 'user.add4', 'user.counter4', 'user.or'].map((id) => [id, contentHash(lib, id)]));
    const edited = clone(lib.get('user.xor')!);
    edited.body!.wires.reverse();
    edited.body!.wires.pop(); // ตัดสายเส้นหนึ่งออก
    const after = new ComponentLibrary([...lib.all().filter((d) => d.id !== 'user.xor'), edited]);
    expect(contentHash(after, 'user.xor')).not.toBe(before['user.xor']);
    expect(contentHash(after, 'user.add4')).not.toBe(before['user.add4']);
    expect(contentHash(after, 'user.counter4')).not.toBe(before['user.counter4']);
    expect(contentHash(after, 'user.or')).toBe(before['user.or']);
  });

  it('หาชิ้นที่ใช้ XOR อยู่ทั้งทางตรงและทางอ้อม', () => {
    const deps = findDependents(referenceLibrary(), 'user.xor');
    expect(deps).toEqual(['user.add4', 'user.counter4', 'user.fa', 'user.ha', 'user.inc4']);
  });
});

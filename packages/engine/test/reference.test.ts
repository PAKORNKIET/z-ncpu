// ทดสอบด้วยฟังก์ชันอ้างอิง (Spec ส่วน 7): ขาเข้าเกิน 16 บิตใช้กรณีขอบ + สุ่ม
import { describe, expect, it } from 'vitest';
import { circuit, inp, out, referenceRows, testComponent } from '../src';
import { referenceLibrary } from '../fixtures/reference';

/** บวก 8 บิตจาก Full Adder 8 ตัว */
function add8Library(broken = false) {
  const lib = referenceLibrary();
  const b = circuit('user.add8', 'Add8', [inp('a', 8), inp('b', 8), inp('cin'), out('sum', 8), out('cout')]);
  const sa = b.add('prim.split', { params: { width: 8 } });
  const sb = b.add('prim.split', { params: { width: 8 } });
  const ms = b.add('prim.merge', { params: { width: 8 } });
  b.wire('self.a', `${sa}.in`).wire('self.b', `${sb}.in`).wire(`${ms}.out`, 'self.sum');
  let carry = 'self.cin';
  for (let i = 0; i < 8; i++) {
    const fa = b.add('user.fa');
    // broken: บิต 6 ลืมต่อตัวทด
    b.wire(`${sa}.b${i}`, `${fa}.a`).wire(`${sb}.b${i}`, `${fa}.b`);
    if (!(broken && i === 6)) b.wire(carry, `${fa}.cin`);
    else b.wire('self.cin', `${fa}.cin`);
    b.wire(`${fa}.sum`, `${ms}.b${i}`);
    carry = `${fa}.cout`;
  }
  b.wire(carry, 'self.cout');
  lib.add(b.build());
  return lib;
}

describe('ReferenceSuite', () => {
  it('ขาเข้า 17 บิต: กรณีขอบทุกแบบ + สุ่ม และได้แถวเดิมทุกครั้งจาก seed เดียวกัน', () => {
    const pins = [inp('a', 8), inp('b', 8), inp('cin')];
    const rows = referenceRows(pins, 'add8', 100, 7);
    expect(rows).toHaveLength(6 * 6 * 2 + 100);
    expect(rows).toContainEqual({ in: { a: 255, b: 255, cin: 1 }, out: { sum: 255, cout: 1 } });
    expect(rows).toContainEqual({ in: { a: 128, b: 128, cin: 0 }, out: { sum: 0, cout: 1 } });
    expect(referenceRows(pins, 'add8', 100, 7)).toEqual(rows);
    expect(referenceRows(pins, 'add8', 100, 8)).not.toEqual(rows);
  });

  it('ขาเข้าไม่เกิน 16 บิต ทดสอบครบทุกกรณี', () => {
    expect(referenceRows([inp('a', 8), inp('b', 8)], 'add8')).toHaveLength(65536);
  });

  it.each(['fast', 'visual'] as const)('บวก 8 บิตที่ถูกต้องผ่าน และที่ต่อผิดไม่ผ่าน (%s)', (mode) => {
    const suite = { type: 'reference', ref: 'add8', samples: 300 } as const;
    expect(testComponent(add8Library(), 'user.add8', suite, mode).report?.passed).toBe(true);
    const bad = testComponent(add8Library(true), 'user.add8', suite, mode).report;
    expect(bad?.passed).toBe(false);
    expect(bad?.failed).toBeGreaterThan(0);
  });

  it('ชื่อฟังก์ชันอ้างอิงที่ไม่มี ได้ error ไม่ใช่ผ่าน', () => {
    const r = testComponent(add8Library(), 'user.add8', { type: 'reference', ref: 'nope' }, 'fast').report;
    expect(r?.passed).toBe(false);
    expect(r?.error?.message.th).toMatch(/nope/);
  });
});

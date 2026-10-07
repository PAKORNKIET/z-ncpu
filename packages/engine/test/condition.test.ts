import { describe, expect, it } from 'vitest';
import { checkCondition, evaluateCondition, parseCondition, type CondEnv } from '../src';

const regs: Record<string, number | 'X'> = { PC: 0x14, A: 10, B: 3, Z: 1, U: 'X' };
const env: CondEnv = {
  name: (n) => regs[n.toUpperCase()],
  call: (f, arg) => (f === 'net' && arg === 'alu1.z' ? 1 : undefined),
  index: (f, i) => (f.toUpperCase() === 'MEM' ? (i === 0x20 ? 255 : 0) : undefined),
};
const ev = (text: string): boolean => {
  const p = parseCondition(text);
  if (!p.ok) throw new Error(p.error.message.th);
  return evaluateCondition(p.ast, env);
};
const error = (text: string) => {
  const p = parseCondition(text);
  return p.ok ? null : { col: p.error.col, th: p.error.message.th };
};

describe('เงื่อนไข breakpoint', () => {
  it('ตัวอย่างใน Spec ส่วน 9', () => {
    expect(ev('PC == 0x14')).toBe(true);
    expect(ev('A == 10')).toBe(true);
    expect(ev('MEM[0x20] == 255')).toBe(true);
    expect(ev('net("alu1.z") == 1')).toBe(true);
    expect(ev('PC == 0x14 && A == 11')).toBe(false);
  });

  it('ลำดับความสำคัญ: && ก่อน ||, เปรียบเทียบก่อน &&, บวกลบก่อนเปรียบเทียบ', () => {
    expect(ev('A == 1 || A == 10 && B == 3')).toBe(true);
    expect(ev('(A == 1 || A == 10) && B == 4')).toBe(false);
    expect(ev('A - B == 7')).toBe(true);
    expect(ev('!(A < 10) && -B < 0 && A >= 10 && B <= 3 && A > B && A != B')).toBe(true);
    expect(ev('Z')).toBe(true);
  });

  it('ค่า X ทำให้เป็นเท็จ เว้นแต่อีกข้างของ || เป็นจริง', () => {
    expect(ev('U == 0')).toBe(false);
    expect(ev('U != 0')).toBe(false);
    expect(ev('U == 0 || A == 10')).toBe(true);
    expect(ev('U == 0 && A == 1')).toBe(false);
  });

  it('error บอกคอลัมน์', () => {
    expect(error('PC = 5')).toEqual({ col: 4, th: 'ใช้ == เพื่อเปรียบเทียบ (= ตัวเดียวใช้ไม่ได้)' });
    expect(error('A == 1 & B')).toMatchObject({ col: 8 });
    expect(error('A == ')).toMatchObject({ col: 6, th: 'เงื่อนไขจบไม่ครบ' });
    expect(error('(A == 1')).toMatchObject({ th: 'ขาด ")"' });
    expect(error('A == 1 B == 2')).toMatchObject({ col: 8 });
    expect(error('net(alu)')).toMatchObject({ col: 5 });
    expect(error('')).toMatchObject({ th: 'ยังไม่ได้เขียนเงื่อนไข' });
    expect(error('A == "x')).toMatchObject({ col: 6 });
    expect(error('(' .repeat(40) + '1' + ')'.repeat(40))?.th).toContain('ลึก');
  });

  it('ตรวจชื่อที่ไม่รู้จักได้ก่อนรัน แม้อยู่หลัง && หรือ ||', () => {
    const p = parseCondition('A == 1 && FOO == 2');
    expect(p.ok && checkCondition(p.ast, env)).toEqual({ col: 11, message: { th: 'ไม่รู้จัก "FOO"', en: 'unknown "FOO"' } });
    const q = parseCondition('net("nope") == 1');
    expect(q.ok && checkCondition(q.ast, env)?.message.th).toBe('ไม่รู้จัก net("nope")');
    const r = parseCondition('PC == 3 || MEM[1] == 0');
    expect(r.ok && checkCondition(r.ast, env)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { assemble, explainInstruction, type RegisterView } from '../src';

const r: RegisterView = { pc: 4, a: 5, b: 3, c: 0, d: 200, sp: 0xf0, flags: 0b000 };
const ex = (src: string, regs: Partial<RegisterView> = {}): string => explainInstruction(assemble(src).words[0]!, { ...r, ...regs });

describe('อธิบายคำสั่งเป็นภาษาคน', () => {
  it('ALU บอกค่าและ flags (ตัวอย่างใน Spec ส่วน 8)', () => {
    expect(ex('ADD A, B')).toBe('ADD A, B: A ← 5 + 3 = 8 (Z=0 C=0 N=0)');
    expect(ex('ADD D, 100')).toBe('ADD D, 0x64: D ← 200 + 100 = 44 (Z=0 C=1 N=0)');
    expect(ex('CMP A, 5')).toBe('CMP A, 0x05: คำนวณ A − 5 = 0 เก็บแค่ flags (Z=1 C=1 N=0) A ไม่เปลี่ยน');
    expect(ex('NOT C')).toBe('NOT C: C ← NOT 0 = 255 (Z=0 C=0 N=1)');
  });
  it('หน่วยความจำ I/O และ stack', () => {
    expect(ex('STORE [OUT], A')).toBe('STORE [0xF0], A: จอตัวเลข (0xF0) ← A = 5');
    expect(ex('LOAD B, [0x10]')).toBe('LOAD B, [0x10]: B ← ค่าจาก RAM[0x10]');
    expect(ex('LOAD B, [SW]')).toBe('LOAD B, [0xF8]: B ← ค่าจาก สวิตช์ (0xF8)');
    expect(ex('PUSH A')).toBe('PUSH A: เขียน A = 5 ที่ RAM[SP−1 = 0xEF] แล้ว SP ← 0xEF');
    expect(ex('MOV C, B')).toBe('MOV C, B: C ← B (3)');
  });
  it('กระโดดตาม flags', () => {
    expect(ex('JNZ 1')).toBe('JNZ 0x01: Z = 0 จึงกระโดดไป 0x01');
    expect(ex('JNZ 1', { flags: 0b100 })).toBe('JNZ 0x01: Z = 1 จึงไม่กระโดด ไปคำสั่งถัดไป 0x05');
    expect(ex('CALL 9')).toBe('CALL 0x09: จำที่กลับ 0x05 ไว้ที่ RAM[0xEF] แล้วกระโดดไป 0x09');
    expect(ex('HALT')).toContain('หยุด');
    expect(explainInstruction(0xc000, r)).toContain('ไม่ใช่คำสั่ง');
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decode, encode, formatDecoded, hex16, Z8 } from '../src';

describe('Z8 encoding', () => {
  it('ตรงกับโปรแกรมตัวอย่างในเอกสาร Spec ส่วน 10 (นับ 0 ถึง 9)', () => {
    const program = [
      encode(Z8, { mnemonic: 'MOV', rd: 'A', src: { imm: 0 } }),
      encode(Z8, { mnemonic: 'STORE', rd: 'A', src: { imm: 0xf0 } }),
      encode(Z8, { mnemonic: 'ADD', rd: 'A', src: { imm: 1 } }),
      encode(Z8, { mnemonic: 'CMP', rd: 'A', src: { imm: 10 } }),
      encode(Z8, { mnemonic: 'JNZ', src: { imm: 1 } }),
      encode(Z8, { mnemonic: 'HALT' }),
    ];
    expect(program.map(hex16)).toEqual(['0900', '19F0', '4101', '790A', '9101', '3800']);
  });

  it('decode แล้วอ่านกลับเป็น assembly ได้', () => {
    expect(formatDecoded(decode(Z8, 0x19f0)!)).toBe('STORE [0xF0], A');
    expect(formatDecoded(decode(Z8, 0x4101)!)).toBe('ADD A, 0x01');
    expect(formatDecoded(decode(Z8, encode(Z8, { mnemonic: 'SUB', rd: 'C', src: { reg: 'D' } }))!)).toBe('SUB C, D');
    expect(formatDecoded(decode(Z8, 0x3800)!)).toBe('HALT');
  });

  it('กลุ่ม 11 สงวนไว้ decode ไม่ได้', () => {
    expect(decode(Z8, 0xc000)).toBeUndefined();
  });

  it('ค่าคงที่เกิน 8 บิตเป็น error', () => {
    expect(() => encode(Z8, { mnemonic: 'ADD', rd: 'A', src: { imm: 256 } })).toThrow(RangeError);
  });

  it('encode แล้ว decode กลับได้ค่าเดิมเสมอ', () => {
    const regs = Object.keys(Z8.registers);
    fc.assert(
      fc.property(
        fc.constantFrom(...Z8.instructions.filter((d) => d.operands.includes('rd') && d.operands.some((o) => o !== 'rd'))),
        fc.constantFrom(...regs),
        fc.oneof(fc.integer({ min: 0, max: 255 }).map((imm) => ({ imm })), fc.constantFrom(...regs).map((reg) => ({ reg }))),
        (def, rd, src) => {
          const d = decode(Z8, encode(Z8, { mnemonic: def.mnemonic, rd, src }))!;
          expect(d.def.mnemonic).toBe(def.mnemonic);
          expect(d.rd).toBe(rd);
          expect(d.src).toEqual(src);
        },
      ),
    );
  });
});

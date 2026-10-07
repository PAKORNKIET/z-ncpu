import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assemble, disassemble, disassembleWord, formatDiagnostic, hex16, Z8 } from '../src';

const COUNT = `
; นับ 0 ถึง 9 แล้วแสดงบนจอ (Spec ส่วน 10)
        MOV A, 0
loop:   STORE [OUT], A
        ADD A, 1
        CMP A, 10
        JNZ loop
        HALT
`;

const ok = (src: string) => {
  const r = assemble(src);
  expect(r.diagnostics.map((d) => formatDiagnostic(d))).toEqual([]);
  return r;
};

const errors = (src: string) => assemble(src).diagnostics.map((d) => ({ line: d.line, col: d.col, th: d.message.th }));

describe('assembler', () => {
  it('โปรแกรมนับ 0–9 ได้รหัสเครื่องตรงกับเอกสาร Spec', () => {
    const r = ok(COUNT);
    expect(r.words.map(hex16)).toEqual(['0900', '19F0', '4101', '790A', '9101', '3800']);
    expect(r.labels).toEqual({ loop: 1 });
    expect(r.lineOf).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('รองรับเลขฐาน 16, ฐาน 2, ตัวอักษร, เลขติดลบ และบวกลบชื่อ', () => {
    const r = ok(`
      .equ BUF, 0x20
      SIZE = 4
      MOV A, 0b1010
      MOV B, 'A'
      MOV C, -1
      STORE [BUF+SIZE-1], A
      LOAD D, [B]
      mov a, b ; ตัวพิมพ์เล็กก็ได้
    `);
    expect(disassemble(r.words)).toEqual(['MOV A, 0x0A', 'MOV B, 0x41', 'MOV C, 0xFF', 'STORE [0x23], A', 'LOAD D, [B]', 'MOV A, B']);
  });

  it('label ภาษาไทย, label ที่อยู่บรรทัดเดียวกับคำสั่ง และกระโดดไปข้างหน้าได้', () => {
    const r = ok(`
      JMP จบ
      วน: ADD A, 1
      จบ: HALT
    `);
    expect(r.labels).toEqual({ วน: 1, จบ: 2 });
    expect(disassemble(r.words)).toEqual(['JMP 0x02', 'ADD A, 0x01', 'HALT']);
  });

  it('ชื่อ I/O มาจากไฟล์ ISA', () => {
    const r = ok('LOAD A, [SW]\nSTORE [LEDS], A\nLOAD B, [KEY]\nSTORE [SEG], B\nLOAD C, [BTN]');
    expect(disassemble(r.words)).toEqual(['LOAD A, [0xF8]', 'STORE [0xF1], A', 'LOAD B, [0xFA]', 'STORE [0xF2], B', 'LOAD C, [0xF9]']);
  });

  it('.word ใส่ค่า 16 บิตตรงๆ', () => {
    expect(ok('.word 0xC123').words).toEqual([0xc123]);
  });

  it('error ภาษาไทยพร้อมบรรทัดและคอลัมน์', () => {
    expect(errors('MOV A, 0\nJNZ lop\nloop: HALT')).toEqual([{ line: 2, col: 5, th: 'ไม่รู้จักชื่อ "lop" หมายถึง "loop" หรือเปล่า?' }]);
    expect(errors('  MVO A, 1')).toEqual([{ line: 1, col: 3, th: 'ไม่รู้จักคำสั่ง "MVO" หมายถึง MOV หรือเปล่า?' }]);
    expect(errors('ADD A')[0]!.th).toContain('ต้องการ 2 ตัว');
    expect(errors('ADD 5, A')[0]).toMatchObject({ col: 5, th: expect.stringContaining('register') });
    expect(errors('LOAD A, 0x10')[0]!.th).toContain('วงเล็บ');
    expect(errors('ADD A, [0x10]')[0]!.th).toContain('ไม่ใช้วงเล็บ');
    expect(errors('MOV A, 256')[0]!.th).toContain('-128 ถึง 255');
    expect(errors('MOV A, 10h')[0]).toMatchObject({ col: 8 });
    expect(errors('x: NOP\nx: NOP')[0]!.th).toContain('ซ้ำ');
    expect(errors('OUT: NOP')[0]!.th).toContain('มีอยู่แล้วในระบบ');
    expect(errors('mov: NOP')[0]!.th).toContain('ใช้ "mov" เป็นชื่อไม่ได้');
    expect(errors('MOV A 1')[0]!.th).toContain('ลืม ","');
    expect(errors('LOAD A, [5')[0]!.th).toContain(']');
    expect(errors('MOV A, B+1')[0]!.th).toContain('register B');
    expect(errors('MOV A, @')[0]).toMatchObject({ col: 8 });
    expect(errors('.org 5')[0]!.th).toContain('.equ');
  });

  it('error หลายบรรทัดรายงานครบทุกบรรทัด และยังได้ address ที่ถูกต้อง', () => {
    const r = assemble('MVO A, 1\nADD A, 1\nJMP nowhere\nend: HALT');
    expect(r.ok).toBe(false);
    expect(r.diagnostics.map((d) => d.line)).toEqual([1, 3]);
    expect(r.labels).toEqual({ end: 3 });
  });

  it('comment ไม่ตัดในตัวอักษร ";"', () => {
    expect(ok("MOV A, ';' ; comment").words).toEqual([0x093b]);
  });

  it('โปรแกรมเกิน 256 คำสั่งเป็น error', () => {
    const r = assemble('NOP\n'.repeat(257));
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]).toMatchObject({ line: 257 });
  });

  it('disassemble แล้ว assemble กลับได้ค่าเดิมทุกบิต (ทุกคำ 16 บิต)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 0xffff }), { minLength: 1, maxLength: 40 }), (words) => {
        const r = assemble(disassemble(words).join('\n'));
        expect(r.ok).toBe(true);
        expect(r.words).toEqual(words);
      }),
    );
  });

  it('คำที่ไม่ใช่คำสั่งมาตรฐานเขียนเป็น .word', () => {
    expect(disassembleWord(0xc000)).toBe('.word 0xC000');
    // NOP ที่มีบิตเกินมา
    expect(disassembleWord(0x0001)).toBe('.word 0x0001');
    expect(disassembleWord(0x3800, Z8)).toBe('HALT');
  });
});

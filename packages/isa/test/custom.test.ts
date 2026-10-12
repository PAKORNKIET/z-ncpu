import type { IsaExtension } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import {
  assemble,
  checkExtension,
  disassembleWord,
  explainInstruction,
  extendIsa,
  isaOfSuite,
  makeOracle,
  parseIsaFile,
  parseSemantics,
  runZ8,
  serializeIsa,
  Z8,
  Z8_PLUS_DEFAULT,
} from '../src';

const ext = (instructions: IsaExtension['instructions']): IsaExtension => ({ format: 'zncpu-isa', version: 1, base: 'Z8', name: 'ทดลอง', instructions });

const MINE = ext([
  { mnemonic: 'SHR', func: 0, operands: ['rd'], semantics: 'CF = rd & 1; rd = rd >> 1; Z = (rd >> 1) == 0; N = 0' },
  { mnemonic: 'INC', func: 1, operands: ['rd'], semantics: 'rd = rd + 1' },
  { mnemonic: 'SWAP', func: 2, operands: ['rd', 'src'], semantics: 'rd = src\nmem[0x20] = rd' },
  { mnemonic: 'JNC', func: 3, operands: ['src'], semantics: 'PC = CF ? PC + 1 : src' },
  { mnemonic: 'LDI', func: 4, operands: ['rd', '[src]'], semantics: 'rd = mem[src] + 1' },
  { mnemonic: 'CLR', func: 5, operands: [], semantics: 'A = 0; B = 0; C = 0; D = 0' },
  { mnemonic: 'NEG', func: 6, operands: ['rd'], semantics: 'rd = -rd; Z = rd == 0; N = (-rd >> 7) & 1' },
]);

describe('สูตรของคำสั่ง', () => {
  it('แปลงสูตรได้ และบอกว่าอ่านอะไร', () => {
    const r = parseSemantics('CF = rd & 1; rd = rd >> 1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assigns.map((a) => a.target)).toEqual(['CF', 'RD']);
      expect(r.assigns.map((a) => a.text)).toEqual(['CF = rd & 1', 'rd = rd >> 1']);
      expect([...r.reads]).toContain('RD');
    }
  });

  it.each([
    ['rd = ', 'สูตรจบกลางคัน'],
    ['rd = rd >> 1 1', 'เกินมา'],
    ['X = 1', 'ไม่รู้จัก "X"'],
    ['src = 1', 'อ่านอย่างเดียว'],
    ['rd = 1; rd = 2', 'ซ้ำ'],
    ['mem[1] = 1; mem[2] = 2', 'ครั้งเดียว'],
    ['rd = (1 + 2', 'ขาด ")"'],
    ['rd = 1 ? 2', 'ขาด ":"'],
    ['rd = 3 $ 4', 'อักขระ'],
    ['', 'ยังไม่มีสูตร'],
    ['rd = 1'.padEnd(400, ' '), 'ยาวเกิน'],
  ])('สูตรผิด "%s" บอกเหตุผลเป็นภาษาไทย', (text, why) => {
    const r = parseSemantics(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message.th).toContain(why);
  });

  it('ห้ามใช้ eval หรือ Function ในตัวแปลสูตร', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync(new URL('../src/sem.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\beval\s*\(|new\s+Function/);
  });
});

describe('ISA ของผู้เล่น', () => {
  it('ตรวจชื่อซ้ำ ชื่อชนของเดิม func ซ้ำ รูปแบบผิด และสูตรที่ใช้ตัวถูกดำเนินการที่ไม่มี', () => {
    const { issues, compiled } = checkExtension(
      ext([
        { mnemonic: 'ADD', func: 0, operands: ['rd'], semantics: 'rd = 1' },
        { mnemonic: 'OUT', func: 1, operands: ['rd'], semantics: 'rd = 1' },
        { mnemonic: 'ok', func: 2, operands: ['rd'], semantics: 'rd = 1' },
        { mnemonic: 'SHR', func: 3, operands: ['rd'], semantics: 'rd = rd >> 1' },
        { mnemonic: 'SHR', func: 3, operands: ['rd'], semantics: 'rd = 1' },
        { mnemonic: 'TWO', func: 4, operands: ['src', 'rd'], semantics: 'rd = src' },
        { mnemonic: 'USE', func: 5, operands: [], semantics: 'A = rd' },
        { mnemonic: 'USES', func: 6, operands: ['rd'], semantics: 'rd = src' },
      ]),
    );
    expect(issues.map((i) => `${i.index}:${i.field}`)).toEqual(['0:mnemonic', '1:mnemonic', '2:mnemonic', '4:mnemonic', '4:func', '5:operands', '6:semantics', '7:semantics']);
    expect(compiled.map((c) => c.mnemonic)).toEqual(['SHR']);
  });

  it('assembler และ disassembler รู้จักคำสั่งใหม่ ส่วน ISA เดิมไม่รู้จัก', () => {
    const isa = extendIsa(MINE);
    expect(checkExtension(MINE).issues).toEqual([]);
    const r = assemble('SHR B\nSWAP C, 7\nJNC end\nLDI D, [0x10]\nCLR\nend: HALT', isa);
    expect(r.diagnostics).toEqual([]);
    expect(r.words[0]).toBe((3 << 14) | (0 << 11) | (1 << 9));
    expect(r.words.slice(0, 5).map((w) => disassembleWord(w, isa))).toEqual(['SHR B', 'SWAP C, 0x07', 'JNC 0x05', 'LDI D, [0x10]', 'CLR']);
    const plain = assemble('SHR B', Z8);
    expect(plain.ok).toBe(false);
    expect(plain.diagnostics[0]!.message.th).toContain('ไม่รู้จักคำสั่ง');
    expect(disassembleWord(r.words[0]!, Z8)).toBe('.word 0xC200');
    // ชื่อคำสั่งใหม่ใช้เป็น label ไม่ได้
    expect(assemble('SHR: HALT', isa).ok).toBe(false);
  });

  it('emulator ทำตามสูตร: ทุกสูตรอ่านค่าก่อนคำสั่ง แล้วเขียนพร้อมกัน', () => {
    const isa = extendIsa(MINE);
    const src = assemble('MOV A, 0x81\nSHR A\nSHR A\nINC A\nMOV B, 0xFF\nINC B\nSWAP C, 9\nLOAD D, [0x20]\nMOV A, 5\nSTORE [0x10], A\nLDI B, [0x10]\nNEG A\nCLR\nHALT', isa);
    expect(src.ok).toBe(true);
    const t = runZ8(src.words, 100, {}, isa);
    const at = (k: number) => t[k]!;
    expect(at(2)).toMatchObject({ a: 0x40, flags: 0b010 }); // ตัวทด = บิตที่หลุด, Z ดูจากค่าใหม่
    expect(at(3)).toMatchObject({ a: 0x20, flags: 0b000 });
    expect(at(4)).toMatchObject({ a: 0x21, flags: 0b000 }); // INC ไม่แตะ flags
    expect(at(6)).toMatchObject({ b: 0 }); // 255 + 1 ตัดเหลือ 8 บิต
    expect(at(8)).toMatchObject({ c: 9, d: 0 }); // mem[0x20] ได้ค่า rd เก่า (0)
    expect(at(11)).toMatchObject({ b: 6 });
    expect(at(12)).toMatchObject({ a: 251, flags: 0b001 });
    expect(at(13)).toMatchObject({ a: 0, b: 0, c: 0, d: 0 });
    expect(t[t.length - 1]!.halt).toBe(1);
  });

  it('กระโดดตามสูตร และ func ที่ไม่มีคำสั่งทำงานเหมือน NOP', () => {
    const isa = extendIsa(MINE);
    const r = assemble('MOV A, 200\nADD A, 100\nJNC skip\nMOV B, 1\nskip: .word 0xF800\nHALT', isa);
    expect(r.ok).toBe(true);
    const t = runZ8(r.words, 20, {}, isa);
    // ADD ล้น C = 1 จึงไม่กระโดด ทำ MOV B, 1 แล้ว .word กลุ่ม 11 func 7 (ไม่มีคำสั่ง) ไม่ทำอะไร
    expect(t[t.length - 1]).toMatchObject({ b: 1, pc: 5, halt: 1 });
  });

  it('oracle ของชุดทดสอบใช้ ISA ที่ด่านกำหนด', () => {
    const isa = isaOfSuite({ type: 'cpu', isa: Z8_PLUS_DEFAULT });
    const words = makeOracle(isa).assemble('MOV A, 9\nSHR A\nHALT');
    expect(makeOracle(isa).run(words, 10, {}).at(-1)).toMatchObject({ a: 4 });
    expect(isaOfSuite({ type: 'cpu' })).toBe(Z8);
    expect(() => makeOracle(Z8).assemble('SHR A')).toThrow(/ไม่รู้จักคำสั่ง/);
    // ผลถูกจำไว้ต่อ object
    expect(extendIsa(Z8_PLUS_DEFAULT)).toBe(isa);
  });

  it('คำอธิบายคำสั่งถัดไปของคำสั่งใหม่', () => {
    const isa = extendIsa(MINE);
    const regs = { pc: 3, a: 6, b: 0, c: 0, d: 0, sp: 0xf0, flags: 0 };
    const w = (s: string) => assemble(s, isa).words[0]!;
    expect(explainInstruction(w('SHR A'), regs, isa)).toBe('SHR A: CF = rd & 1; rd = rd >> 1; Z = (rd >> 1) == 0; N = 0 → A = 3, Z = 0, C = 0, N = 0');
    expect(explainInstruction(w('JNC 0x30'), regs, isa)).toBe('JNC 0x30: PC = CF ? PC + 1 : src → ไปที่ 0x30');
    expect(explainInstruction(w('LDI B, [0x10]'), regs, isa)).toBe('LDI B, [0x10]: rd = mem[src] + 1');
    expect(explainInstruction(w('SWAP B, 2'), regs, isa)).toBe('SWAP B, 0x02: rd = src; mem[0x20] = rd → B = 2, RAM[0x20] = 0');
  });

  it('ไฟล์ .isa.json: เขียนแล้วอ่านกลับได้เหมือนเดิม และไม่รับไฟล์แปลกปลอม', () => {
    const back = parseIsaFile(serializeIsa(MINE));
    expect(back).toEqual({ ok: true, ext: MINE });
    const bad = (o: unknown) => parseIsaFile(JSON.stringify(o));
    expect(parseIsaFile('nope').ok).toBe(false);
    expect(bad({ format: 'zncpu' }).ok).toBe(false);
    expect(bad({ ...MINE, version: 2 }).ok).toBe(false);
    expect(bad({ ...MINE, base: 'x86' }).ok).toBe(false);
    expect(bad({ ...MINE, instructions: Array(9).fill(MINE.instructions[0]) }).ok).toBe(false);
    expect(bad({ ...MINE, instructions: [{ ...MINE.instructions[0], operands: ['rx'] }] }).ok).toBe(false);
    expect(bad({ ...MINE, instructions: [{ ...MINE.instructions[0], semantics: 'x'.repeat(301) }] }).ok).toBe(false);
    expect(parseIsaFile(' '.repeat(20_001)).ok).toBe(false);
    // ช่องที่ไม่รู้จักถูกทิ้ง
    const extra = bad({ ...MINE, evil: 1, instructions: [{ ...MINE.instructions[0], onload: 'x' }] });
    expect(extra.ok && Object.keys(extra.ext.instructions[0]!)).toEqual(['mnemonic', 'func', 'operands', 'semantics']);
  });
});

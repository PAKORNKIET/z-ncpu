import { describe, expect, it } from 'vitest';
import { assemble, runZ8, SEG7_PATTERNS, Z8Machine, z8Alu } from '../src';

const asm = (src: string): number[] => {
  const r = assemble(src);
  if (!r.ok) throw new Error(r.diagnostics.map((d) => `${d.line}: ${d.message.th}`).join('\n'));
  return r.words;
};

describe('Z8 emulator', () => {
  it('นับ 0–9 บนจอแล้วหยุด', () => {
    const trace = runZ8(asm('MOV A, 0\nloop: STORE [OUT], A\nADD A, 1\nCMP A, 10\nJNZ loop\nHALT'), 1000);
    const shown = trace.filter((s, i) => i > 0 && s.out !== trace[i - 1]!.out).map((s) => s.out);
    expect(shown).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const last = trace[trace.length - 1]!;
    expect(last).toMatchObject({ halt: 1, pc: 5, a: 10, flags: 0b110 });
    // MOV + 10 รอบ × 4 คำสั่ง = 41 clock แล้ว PC ชี้ HALT
    expect(last.cycle).toBe(41);
  });

  it('สถานะหลัง reset และ I/O ยังไม่ถูกเขียน', () => {
    const [s] = runZ8([], 0);
    expect(s).toEqual({ cycle: 0, pc: 0, a: 0, b: 0, c: 0, d: 0, sp: 0xf0, flags: 0, halt: 0 });
  });

  it('flags ของ ADD/SUB/CMP และคำสั่งตรรกะ', () => {
    const m = new Z8Machine(asm('MOV A, 200\nADD A, 100\nSUB A, 45\nCMP A, 0\nMOV B, 0x80\nOR B, 1\nNOT B\nXOR B, 0x7E'));
    m.reset();
    const flags: string[] = [];
    for (let i = 0; i < 8; i++) {
      m.step();
      flags.push(`${m.regs[0]},${m.regs[1]},${m.z}${m.c}${m.n}`);
    }
    expect(flags).toEqual([
      '200,0,000',
      '44,0,010', // 300 ล้น: C = 1
      '255,0,001', // 44 − 45 ยืม: C = 0, N = 1
      '255,0,011', // CMP A,0: A ≥ 0 จึง C = 1 และ A ไม่เปลี่ยน
      '255,128,011', // MOV ไม่แตะ flags
      '255,129,001', // OR: C = 0
      '255,126,000',
      '255,0,100',
    ]);
  });

  it('กระโดดตามเงื่อนไข JZ JNZ JC JN', () => {
    const trace = runZ8(
      asm(`
        MOV A, 1
        SUB A, 1      ; Z=1 C=1
        JZ z_ok
        HALT
z_ok:   JC c_ok
        HALT
c_ok:   SUB A, 1      ; 0−1 = 255 N=1 C=0
        JN n_ok
        HALT
n_ok:   JC bad
        JNZ done
bad:    HALT
done:   MOV D, 0x77
        HALT
      `),
      100,
    );
    expect(trace[trace.length - 1]).toMatchObject({ d: 0x77, halt: 1 });
  });

  it('PUSH/POP และ CALL/RET ใช้ stack ที่โตลงล่างจาก 0xF0', () => {
    const m = new Z8Machine(
      asm(`
        MOV A, 7
        PUSH A
        CALL double
        POP B
        HALT
double: ADD A, A
        RET
      `),
    );
    m.reset();
    m.step(); // MOV
    m.step(); // PUSH
    expect([m.sp, m.ram[0xef]]).toEqual([0xef, 7]);
    m.step(); // CALL
    expect([m.sp, m.ram[0xee], m.pc]).toEqual([0xee, 3, 5]);
    m.step(); // ADD
    m.step(); // RET
    expect([m.sp, m.pc, m.regs[0]]).toEqual([0xef, 3, 14]);
    m.step(); // POP
    expect([m.sp, m.regs[1], m.halted]).toEqual([0xf0, 7, true]);
  });

  it('อ่านสวิตช์ ปุ่ม คีย์บอร์ด และเขียน LED กับ 7-segment', () => {
    const trace = runZ8(asm('LOAD A, [SW]\nSTORE [LEDS], A\nLOAD B, [KEY]\nSTORE [SEG], B\nLOAD C, [BTN]\nHALT'), 100, { sw: 0xa5, key: 0x13, btn: 2 });
    expect(trace[trace.length - 1]).toMatchObject({ a: 0xa5, leds: 0xa5, b: 0x13, seg: SEG7_PATTERNS[3], c: 2 });
  });

  it('เขียน address ตั้งแต่ 0xF0 ไม่ไปถึง RAM และ PC กับ SP วนรอบ 8 บิต', () => {
    const m = new Z8Machine(asm('MOV A, 9\nSTORE [0xF0], A\nSTORE [0xF5], A\nLOAD B, [0xF5]'));
    m.reset();
    for (let i = 0; i < 4; i++) m.step();
    expect([m.out, m.ram[0xf0], m.ram[0xf5], m.regs[1]]).toEqual([9, 0, 0, 0]);
    const w = new Z8Machine([]);
    w.reset();
    for (let i = 0; i < 256; i++) w.step();
    expect(w.pc).toBe(0);
  });

  it('คำสั่งที่ไม่ได้ใช้: กลุ่ม 11 กับ 10/111 เป็น NOP ส่วน ALU op 6 ได้ 0', () => {
    const m = new Z8Machine([0x0905, 0xc000, 0xb800, 0x7000]);
    m.reset();
    for (let i = 0; i < 4; i++) m.step();
    expect([m.pc, m.regs[0], m.z]).toEqual([4, 0, 1]);
  });

  it('ALU ตรงกับตาราง', () => {
    expect(z8Alu(0x80, 0x80, 0)).toEqual({ y: 0, z: 1, c: 1, n: 0 });
    expect(z8Alu(5, 3, 7)).toEqual({ y: 2, z: 0, c: 1, n: 0 });
    expect(z8Alu(0x0f, 0, 5)).toEqual({ y: 0xf0, z: 0, c: 0, n: 1 });
  });
});

// Emulator อ้างอิงของ Z8 (Spec ส่วน 10–11)
// ใช้เป็นคำตอบที่ถูกต้องตอนทดสอบ CPU ที่ผู้เล่นต่อเอง: รันโปรแกรมเดียวกันแล้วเทียบค่าทุก cycle
// พฤติกรรมต้องตรงกับ CPU single-cycle ในส่วน 11 ทุกบิต รวมถึงกรณีขอบ (wrap, คำสั่งที่ไม่ได้ใช้)

import { Z8, type IsaDef } from './index';

/** ค่าที่ขาเข้าของ I/O */
export interface Z8Inputs {
  /** สวิตช์ 8 ตัว (อ่านที่ 0xF8) */
  sw?: number;
  /** ปุ่มกด (อ่านที่ 0xF9) */
  btn?: number;
  /** รหัสปุ่มคีย์บอร์ดล่าสุด (อ่านที่ 0xFA) */
  key?: number;
}

/**
 * สถานะที่มองเห็นจากขาของ CPU หลัง tick หนึ่งครั้ง (ตรงกับขาดีบักของด่าน CPU)
 * flags = Z<<2 | C<<1 | N, halt = คำสั่งที่ PC ชี้อยู่คือ HALT
 * out/leds/seg เป็น undefined จนกว่าโปรแกรมจะเขียน (register ของ I/O ไม่ต้อง reset)
 */
export interface CpuSnapshot {
  cycle: number;
  pc: number;
  a: number;
  b: number;
  c: number;
  d: number;
  sp: number;
  flags: number;
  halt: number;
  out?: number;
  leds?: number;
  /** รูปแบบไฟ 7 ส่วน (gfedcba) ของเลขฐานสิบหกในบิตล่างของค่าที่เขียนที่ 0xF2 */
  seg?: number;
}

/** รูปแบบไฟ 7-segment ของเลข 0–F (บิต 0 = a ... บิต 6 = g) ตรงกับด่าน io.seg7 */
export const SEG7_PATTERNS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71] as const;

/** address ของ I/O (Spec ส่วน 10) */
export const IO = { OUT: 0xf0, LEDS: 0xf1, SEG: 0xf2, SW: 0xf8, BTN: 0xf9, KEY: 0xfa, FIRST: 0xf0 } as const;

export const SP_RESET = 0xf0;

/**
 * ALU ของ Z8: op = func ของกลุ่ม 01 (ต้องตรงกับ ref.alu8 ของ engine ซึ่งมีเทสต์เทียบกันทุกกรณี)
 * 0 ADD, 1 SUB, 2 AND, 3 OR, 4 XOR, 5 NOT a, 6 ได้ 0, 7 CMP (คำนวณเหมือน SUB)
 */
export function z8Alu(a: number, b: number, op: number): { y: number; z: number; c: number; n: number } {
  let y: number;
  let c = 0;
  switch (op & 7) {
    case 0: {
      const s = a + b;
      y = s & 0xff;
      c = s >> 8;
      break;
    }
    case 1:
    case 7: {
      const s = a + (~b & 0xff) + 1;
      y = s & 0xff;
      c = s >> 8;
      break;
    }
    case 2:
      y = a & b;
      break;
    case 3:
      y = a | b;
      break;
    case 4:
      y = a ^ b;
      break;
    case 5:
      y = ~a & 0xff;
      break;
    default:
      y = 0;
  }
  return { y, z: y === 0 ? 1 : 0, c, n: (y >> 7) & 1 };
}

const field = (word: number, [hi, lo]: [number, number]): number => (word >>> lo) & ((1 << (hi - lo + 1)) - 1);

export class Z8Machine {
  readonly rom = new Uint16Array(256);
  readonly ram = new Uint8Array(256);
  readonly regs = new Uint8Array(4);
  pc = 0;
  sp = SP_RESET;
  z = 0;
  c = 0;
  n = 0;
  cycle = 0;
  out: number | undefined;
  leds: number | undefined;
  segValue: number | undefined;
  inputs: Required<Z8Inputs> = { sw: 0, btn: 0, key: 0 };

  constructor(
    program: ArrayLike<number> = [],
    readonly isa: IsaDef = Z8,
  ) {
    for (let i = 0; i < Math.min(256, program.length); i++) this.rom[i] = program[i]! & 0xffff;
  }

  /** reset ตาม Spec: A–D = 0, SP = 0xF0, PC = 0, FLAGS = 0 (RAM และ I/O ไม่ถูกล้าง) */
  reset(): void {
    this.regs.fill(0);
    this.pc = 0;
    this.sp = SP_RESET;
    this.z = this.c = this.n = 0;
    this.cycle = 0;
  }

  setInputs(inputs: Z8Inputs): void {
    this.inputs = { ...this.inputs, ...inputs };
  }

  get flags(): number {
    return (this.z << 2) | (this.c << 1) | this.n;
  }

  private parts(word: number) {
    const f = this.isa.fields;
    return { group: field(word, f.group), func: field(word, f.func), rd: field(word, f.rd), m: field(word, f.m), operand: field(word, f.operand) };
  }

  /** คำสั่งที่ PC ชี้อยู่คือ HALT หรือไม่ (ตรงกับขา halt ของ CPU ซึ่งเป็นวงจร combinational) */
  get halted(): boolean {
    const p = this.parts(this.rom[this.pc]!);
    return p.group === 0 && p.func === 7;
  }

  read(addr: number): number {
    if (addr < IO.FIRST) return this.ram[addr]!;
    if (addr === IO.SW) return this.inputs.sw & 0xff;
    if (addr === IO.BTN) return this.inputs.btn & 0xff;
    if (addr === IO.KEY) return this.inputs.key & 0xff;
    // address อื่นตั้งแต่ 0xF0 สงวนไว้ อ่านได้ 0 (โปรแกรมทดสอบไม่อ่านที่นี่)
    return 0;
  }

  write(addr: number, value: number): void {
    const v = value & 0xff;
    if (addr < IO.FIRST) this.ram[addr] = v;
    else if (addr === IO.OUT) this.out = v;
    else if (addr === IO.LEDS) this.leds = v;
    else if (addr === IO.SEG) this.segValue = v;
  }

  /** 1 clock = 1 คำสั่ง */
  step(): void {
    const word = this.rom[this.pc]!;
    const { group, func, rd, m, operand } = this.parts(word);
    const src = m === 1 ? operand : this.regs[operand & 3]!;
    const next = (this.pc + 1) & 0xff;
    let pc = next;
    if (group === 0) {
      switch (func) {
        case 1: // MOV
          this.regs[rd] = src;
          break;
        case 2: // LOAD
          this.regs[rd] = this.read(src);
          break;
        case 3: // STORE
          this.write(src, this.regs[rd]!);
          break;
        case 4: // PUSH
          this.sp = (this.sp - 1) & 0xff;
          this.write(this.sp, this.regs[rd]!);
          break;
        case 5: // POP
          this.regs[rd] = this.read(this.sp);
          this.sp = (this.sp + 1) & 0xff;
          break;
        case 7: // HALT: PC ค้างที่เดิม
          pc = this.pc;
          break;
        default: // NOP และ func 110 ที่ไม่ได้ใช้
      }
    } else if (group === 1) {
      const r = z8Alu(this.regs[rd]!, src, func);
      if (func !== 7) this.regs[rd] = r.y;
      this.z = r.z;
      this.c = r.c;
      this.n = r.n;
    } else if (group === 2) {
      switch (func) {
        case 0:
          pc = src;
          break;
        case 1:
          if (this.z) pc = src;
          break;
        case 2:
          if (!this.z) pc = src;
          break;
        case 3:
          if (this.c) pc = src;
          break;
        case 4:
          if (this.n) pc = src;
          break;
        case 5: // CALL
          this.sp = (this.sp - 1) & 0xff;
          this.write(this.sp, next);
          pc = src;
          break;
        case 6: // RET
          pc = this.read(this.sp);
          this.sp = (this.sp + 1) & 0xff;
          break;
        default: // func 111 ไม่ได้ใช้ ทำงานเหมือน NOP
      }
    }
    // กลุ่ม 11 สงวนไว้ ทำงานเหมือน NOP
    this.pc = pc;
    this.cycle++;
  }

  snapshot(): CpuSnapshot {
    const s: CpuSnapshot = {
      cycle: this.cycle,
      pc: this.pc,
      a: this.regs[0]!,
      b: this.regs[1]!,
      c: this.regs[2]!,
      d: this.regs[3]!,
      sp: this.sp,
      flags: this.flags,
      halt: this.halted ? 1 : 0,
    };
    if (this.out !== undefined) s.out = this.out;
    if (this.leds !== undefined) s.leds = this.leds;
    if (this.segValue !== undefined) s.seg = SEG7_PATTERNS[this.segValue & 15]!;
    return s;
  }
}

/**
 * รันโปรแกรมตั้งแต่ reset แล้วคืนสถานะหลังแต่ละ cycle: [0] คือหลัง reset, [k] คือหลัง k clock
 * หยุดเมื่อถึง HALT (รวมสถานะที่หยุดไว้ด้วย) หรือครบ maxCycles
 */
export function runZ8(program: ArrayLike<number>, maxCycles: number, inputs: Z8Inputs = {}, isa: IsaDef = Z8): CpuSnapshot[] {
  const m = new Z8Machine(program, isa);
  m.reset();
  m.setInputs(inputs);
  const trace = [m.snapshot()];
  while (m.cycle < maxCycles && !m.halted) {
    m.step();
    trace.push(m.snapshot());
  }
  return trace;
}

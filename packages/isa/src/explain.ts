// Why? ระดับ CPU (Spec ส่วน 8): อธิบายคำสั่งเป็นภาษาคนด้วยค่า register ตอนนี้
// เช่น "ADD A, 3 → A = 5 + 3 = 8 (Z=0 C=0 N=0)" ใช้ข้อมูลจากไฟล์ ISA + ALU ของ emulator

import { decode, formatDecoded, Z8, type IsaDef } from './index';
import { IO, z8Alu } from './machine';

export interface RegisterView {
  pc: number;
  a: number;
  b: number;
  c: number;
  d: number;
  sp: number;
  /** Z<<2 | C<<1 | N */
  flags: number;
}

const h = (v: number): string => `0x${v.toString(16).toUpperCase().padStart(2, '0')}`;

/** ชื่อของ address: I/O มีชื่อ ที่เหลือคือ RAM */
function place(addr: number): string {
  const names: Record<number, string> = {
    [IO.OUT]: 'จอตัวเลข (0xF0)',
    [IO.LEDS]: 'LED (0xF1)',
    [IO.SEG]: '7-segment (0xF2)',
    [IO.SW]: 'สวิตช์ (0xF8)',
    [IO.BTN]: 'ปุ่มกด (0xF9)',
    [IO.KEY]: 'คีย์บอร์ด (0xFA)',
  };
  return names[addr] ?? `RAM[${h(addr)}]`;
}

const SYMBOL: Record<string, string> = { ADD: '+', SUB: '−', AND: 'AND', OR: 'OR', XOR: 'XOR', CMP: '−' };

/** อธิบายคำสั่ง word ที่จะทำในจังหวะถัดไป ด้วยค่า register r */
export function explainInstruction(word: number, r: RegisterView, isa: IsaDef = Z8): string {
  const d = decode(isa, word);
  if (!d) return `${h(word >> 8)}${h(word & 0xff).slice(2)}: ไม่ใช่คำสั่งของ Z8 ทำงานเหมือน NOP แล้วไปคำสั่งถัดไป`;
  const text = formatDecoded(d);
  const regs: Record<string, number> = { A: r.a, B: r.b, C: r.c, D: r.d };
  const rd = regs[d.rd] ?? 0;
  const src = 'imm' in d.src ? d.src.imm : (regs[d.src.reg] ?? 0);
  const srcText = 'imm' in d.src ? `${src}` : `${d.src.reg} (${src})`;
  const z = (r.flags >> 2) & 1;
  const c = (r.flags >> 1) & 1;
  const n = r.flags & 1;
  const next = (r.pc + 1) & 0xff;
  const flagText = (x: { z: number; c: number; n: number }): string => `Z=${x.z} C=${x.c} N=${x.n}`;
  const jump = (taken: boolean, why: string): string =>
    taken ? `${text}: ${why} จึงกระโดดไป ${h(src)}` : `${text}: ${why} จึงไม่กระโดด ไปคำสั่งถัดไป ${h(next)}`;

  switch (d.def.mnemonic) {
    case 'NOP':
      return 'NOP: ไม่ทำอะไร ไปคำสั่งถัดไป';
    case 'HALT':
      return 'HALT: หยุด CPU (PC ค้างที่เดิม)';
    case 'MOV':
      return `${text}: ${d.rd} ← ${srcText}`;
    case 'LOAD':
      return `${text}: ${d.rd} ← ค่าจาก ${place(src)}`;
    case 'STORE':
      return `${text}: ${place(src)} ← ${d.rd} = ${rd}`;
    case 'PUSH':
      return `${text}: เขียน ${d.rd} = ${rd} ที่ RAM[SP−1 = ${h((r.sp - 1) & 0xff)}] แล้ว SP ← ${h((r.sp - 1) & 0xff)}`;
    case 'POP':
      return `${text}: ${d.rd} ← RAM[SP = ${h(r.sp)}] แล้ว SP ← ${h((r.sp + 1) & 0xff)}`;
    case 'NOT': {
      const res = z8Alu(rd, src, d.def.func);
      return `${text}: ${d.rd} ← NOT ${rd} = ${res.y} (${flagText(res)})`;
    }
    case 'ADD':
    case 'SUB':
    case 'AND':
    case 'OR':
    case 'XOR':
    case 'CMP': {
      const res = z8Alu(rd, src, d.def.func);
      const expr = `${rd} ${SYMBOL[d.def.mnemonic]} ${src}`;
      if (d.def.mnemonic === 'CMP') return `${text}: คำนวณ ${d.rd} − ${srcText} = ${res.y} เก็บแค่ flags (${flagText(res)}) ${d.rd} ไม่เปลี่ยน`;
      return `${text}: ${d.rd} ← ${expr} = ${res.y} (${flagText(res)})`;
    }
    case 'JMP':
      return `${text}: กระโดดไป ${h(src)}`;
    case 'JZ':
      return jump(z === 1, `Z = ${z}`);
    case 'JNZ':
      return jump(z === 0, `Z = ${z}`);
    case 'JC':
      return jump(c === 1, `C = ${c}`);
    case 'JN':
      return jump(n === 1, `N = ${n}`);
    case 'CALL':
      return `${text}: จำที่กลับ ${h(next)} ไว้ที่ RAM[${h((r.sp - 1) & 0xff)}] แล้วกระโดดไป ${h(src)}`;
    case 'RET':
      return `${text}: กลับไปที่ address ที่อยู่ใน RAM[SP = ${h(r.sp)}] แล้ว SP ← ${h((r.sp + 1) & 0xff)}`;
    default:
      return text;
  }
}

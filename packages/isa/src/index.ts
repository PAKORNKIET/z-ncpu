// @z-ncpu/isa — นิยามชุดคำสั่งแบบ data-driven (Spec ส่วน 10, ข้อ 11)
// M0 มีแค่ encode/decode ทีละคำสั่ง; assembler เต็ม (label, parser, diagnostics) มาใน M3

import type { LocalizedText } from '@z-ncpu/shared';
import z8Json from './z8.isa.json';

export type OperandKind = 'rd' | 'src' | '[src]';

export interface InstructionDef {
  mnemonic: string;
  group: number;
  func: number;
  operands: OperandKind[];
  flags?: string;
}

export interface IsaDef {
  name: string;
  description: LocalizedText;
  wordBits: number;
  dataBits: number;
  /** [บิตสูง, บิตต่ำ] */
  fields: Record<'group' | 'func' | 'rd' | 'm' | 'operand', [number, number]>;
  registers: Record<string, number>;
  instructions: InstructionDef[];
  memoryMap: { from: number; to: number; name: LocalizedText; access?: 'r' | 'w' }[];
}

// JSON import ให้ fields เป็น number[] จึงต้อง cast ผ่าน unknown (รูปแบบถูกตรวจในเทสต์)
export const Z8 = z8Json as unknown as IsaDef;

/** ตัวถูกดำเนินการที่ encode แล้ว: register หรือค่าคงที่ 8 บิต */
export type Src = { reg: string } | { imm: number };

export interface EncodeInput {
  mnemonic: string;
  rd?: string;
  src?: Src;
}

const fieldWidth = ([hi, lo]: [number, number]): number => hi - lo + 1;

function put(word: number, range: [number, number], value: number): number {
  const width = fieldWidth(range);
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) {
    throw new RangeError(`ค่า ${value} ใส่ในฟิลด์ ${width} บิตไม่ได้`);
  }
  return word | (value << range[1]);
}

function get(word: number, range: [number, number]): number {
  return (word >>> range[1]) & (2 ** fieldWidth(range) - 1);
}

function regIndex(isa: IsaDef, name: string): number {
  const idx = isa.registers[name.toUpperCase()];
  if (idx === undefined) throw new Error(`ไม่รู้จัก register "${name}"`);
  return idx;
}

export function encode(isa: IsaDef, ins: EncodeInput): number {
  const def = isa.instructions.find((d) => d.mnemonic === ins.mnemonic.toUpperCase());
  if (!def) throw new Error(`ไม่รู้จักคำสั่ง "${ins.mnemonic}"`);
  const f = isa.fields;
  let word = put(0, f.group, def.group);
  word = put(word, f.func, def.func);
  if (def.operands.includes('rd')) {
    if (ins.rd === undefined) throw new Error(`${def.mnemonic} ต้องระบุ register ปลายทาง`);
    word = put(word, f.rd, regIndex(isa, ins.rd));
  }
  if (def.operands.includes('src') || def.operands.includes('[src]')) {
    if (ins.src === undefined) throw new Error(`${def.mnemonic} ต้องระบุตัวถูกดำเนินการ`);
    if ('imm' in ins.src) {
      word = put(word, f.m, 1);
      word = put(word, f.operand, ins.src.imm);
    } else {
      word = put(word, f.operand, regIndex(isa, ins.src.reg));
    }
  }
  return word;
}

export interface Decoded {
  def: InstructionDef;
  rd: string;
  src: Src;
}

export function decode(isa: IsaDef, word: number): Decoded | undefined {
  const f = isa.fields;
  const group = get(word, f.group);
  const func = get(word, f.func);
  const def = isa.instructions.find((d) => d.group === group && d.func === func);
  if (!def) return undefined;
  const names = Object.entries(isa.registers);
  const regName = (i: number): string => names.find(([, v]) => v === i)?.[0] ?? `R${i}`;
  const operand = get(word, f.operand);
  const src: Src = get(word, f.m) === 1 ? { imm: operand } : { reg: regName(operand & 3) };
  return { def, rd: regName(get(word, f.rd)), src };
}

export function formatDecoded(d: Decoded): string {
  const src = 'imm' in d.src ? `0x${d.src.imm.toString(16).toUpperCase().padStart(2, '0')}` : d.src.reg;
  const parts = d.def.operands.map((o) => (o === 'rd' ? d.rd : o === 'src' ? src : `[${src}]`));
  return parts.length > 0 ? `${d.def.mnemonic} ${parts.join(', ')}` : d.def.mnemonic;
}

export const hex16 = (w: number): string => w.toString(16).toUpperCase().padStart(4, '0');

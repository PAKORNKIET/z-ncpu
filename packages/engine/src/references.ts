// ฟังก์ชันอ้างอิงสำหรับทดสอบวงจรที่ขาเข้ากว้างเกินจะทดสอบครบทุกกรณี (Spec ส่วน 7)
// อยู่ในโค้ดของ engine ไฟล์ด่านอ้างแค่ชื่อ จึงนำเข้าด่านจากคนอื่นได้โดยไม่ต้องรันโค้ดของเขา

import type { PinDef, TruthTableRow } from '@z-ncpu/shared';
import { MAX_EXHAUSTIVE_BITS, exhaustiveRows } from './rows';

type Ins = Record<string, number>;
export type ReferenceFn = (ins: Ins) => Record<string, number>;

const bit = (v: number | undefined): number => (v ?? 0) & 1;

/** รูปแบบไฟจอ 7 ส่วนของ 0–F (บิต 0 = ส่วน a, บิต 6 = ส่วน g) */
export const SEG7 = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71] as const;

export const REFERENCES: Readonly<Record<string, ReferenceFn>> = {
  /** sum = a + b + cin (8 บิต) */
  add8: ({ a = 0, b = 0, cin }) => {
    const s = a + b + bit(cin);
    return { sum: s & 0xff, cout: s >> 8 };
  },
  /** กลับทุกบิต */
  not8: ({ a = 0 }) => ({ y: ~a & 0xff }),
  /** y = a + 1 (วนกลับที่ 0) */
  inc8: ({ a = 0 }) => ({ y: (a + 1) & 0xff }),
  /** y = -a แบบ two's complement */
  neg8: ({ a = 0 }) => ({ y: -a & 0xff }),
  /** diff = a - b (วนรอบ 8 บิต) */
  sub8: ({ a = 0, b = 0 }) => ({ diff: (a - b) & 0xff }),
  /** z = 1 เมื่อ a = 0 */
  zero8: ({ a = 0 }) => ({ z: a === 0 ? 1 : 0 }),
  /** eq = 1 เมื่อ a = b */
  eq8: ({ a = 0, b = 0 }) => ({ eq: a === b ? 1 : 0 }),
  and8: ({ a = 0, b = 0 }) => ({ y: a & b }),
  or8: ({ a = 0, b = 0 }) => ({ y: a | b }),
  xor8: ({ a = 0, b = 0 }) => ({ y: a ^ b }),
  /** sel = 0 → a, sel = 1 → b */
  mux8: ({ a = 0, b = 0, sel }) => ({ y: bit(sel) ? b : a }),
  /** เลือก d0..d3 ตาม sel (2 บิต) */
  sel4: (ins) => ({ y: ins[`d${(ins.sel ?? 0) & 3}`] ?? 0 }),
  /** เลือก d0..d7 ตาม sel (3 บิต) */
  sel8: (ins) => ({ y: ins[`d${(ins.sel ?? 0) & 7}`] ?? 0 }),
  mux16: ({ a = 0, b = 0, sel }) => ({ out: bit(sel) ? b : a }),
  /** ตัวถอดรหัสจอ 7 ส่วน: บิต 0–6 = ส่วน a–g ของเลขฐานสิบหก 0–F */
  seg7: ({ in: v = 0 }) => ({ seg: SEG7[v & 15] ?? 0 }),
  /** ส่ง in ไปที่ o{sel} ขาอื่นเป็น 0 */
  demux4: (ins) => Object.fromEntries([0, 1, 2, 3].map((i) => [`o${i}`, i === ((ins.sel ?? 0) & 3) ? bit(ins.in) : 0])),
  demux8: (ins) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`o${i}`, i === ((ins.sel ?? 0) & 7) ? bit(ins.in) : 0])),
  /**
   * ALU ของ Z8 (Spec ส่วน 10): op = func ของคำสั่งกลุ่ม 01
   * 0 ADD, 1 SUB, 2 AND, 3 OR, 4 XOR, 5 NOT a, 6 ไม่ใช้ (ได้ 0), 7 CMP (คำนวณเหมือน SUB)
   * C = ตัวทดออกของตัวบวก (SUB/CMP คำนวณ a + NOT b + 1 จึง C = 1 เมื่อ a ≥ b), คำสั่งตรรกะ C = 0
   * Z = ผลเป็น 0, N = บิต 7 ของผล
   */
  alu8: ({ a = 0, b = 0, op = 0 }) => {
    let y = 0;
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
    }
    return { y, z: y === 0 ? 1 : 0, c, n: y >> 7 };
  },
  /**
   * Instruction Decoder ของ Z8 (Spec ส่วน 11): อ่าน group, func, m และ flags แล้วสร้างสัญญาณควบคุม
   * wb_sel 0 ALU / 1 RAM / 2 src · addr_sel 0 src / 1 SP / 2 SP−1 · sp_op 0 คงที่ / 1 ลด / 2 เพิ่ม
   * pc_sel 0 PC+1 / 1 src / 2 RAM · mem_src 0 rd / 1 PC+1 (CALL) · คำสั่งที่ไม่ได้ใช้ทำงานเหมือน NOP
   */
  decoder: ({ group = 0, func = 0, m, z, c, n }) => {
    const g0 = group === 0;
    const g1 = group === 1;
    const g2 = group === 2;
    const is = (g: boolean, f: number): boolean => g && func === f;
    const load = is(g0, 2);
    const pop = is(g0, 5);
    const push = is(g0, 4);
    const call = is(g2, 5);
    const ret = is(g2, 6);
    let pcSel = 0;
    if (g2) {
      const taken = [1, bit(z), 1 - bit(z), bit(c), bit(n), 1, 0, 0][func] ?? 0;
      pcSel = ret ? 2 : taken;
    }
    return {
      alu_op: func,
      reg_write: (g0 && (func === 1 || load || pop)) || (g1 && func !== 7) ? 1 : 0,
      flag_write: g1 ? 1 : 0,
      mem_write: is(g0, 3) || push || call ? 1 : 0,
      src_sel: bit(m),
      wb_sel: g0 && (load || pop) ? 1 : is(g0, 1) ? 2 : 0,
      addr_sel: pop || ret ? 1 : push || call ? 2 : 0,
      sp_op: push || call ? 1 : pop || ret ? 2 : 0,
      pc_sel: pcSel,
      mem_src: call ? 1 : 0,
      halt: is(g0, 7) ? 1 : 0,
    };
  },
};

/** PRNG แบบ mulberry32: เร็ว ได้ลำดับเดิมทุกครั้งจาก seed เดียวกัน */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** ค่าขอบของขาที่กว้าง w บิต: 0, 1, ค่ามากสุด, ค่ามากสุด - 1, บิตบนสุด (เครื่องหมาย) และค่าบวกมากสุด */
function edgeValues(width: number): number[] {
  const max = 2 ** width - 1;
  const top = 2 ** (width - 1);
  return [...new Set([0, 1, max, Math.max(0, max - 1), top, top - 1])];
}

/**
 * สร้างแถวทดสอบจากฟังก์ชันอ้างอิง
 * ขาเข้ารวมไม่เกิน 16 บิต → ครบทุกกรณี, เกินกว่านั้น → ทุกการผสมของค่าขอบ (ไม่เกิน 512 แถว) + สุ่ม samples แถว
 */
export function referenceRows(inputs: readonly PinDef[], ref: string, samples = 2000, seed = 1): TruthTableRow[] {
  const fn = REFERENCES[ref];
  if (!fn) throw new Error(`ไม่รู้จักฟังก์ชันอ้างอิง "${ref}"`);
  const totalBits = inputs.reduce((s, p) => s + p.width, 0);
  if (totalBits <= MAX_EXHAUSTIVE_BITS) return exhaustiveRows([...inputs], fn);

  const rows: TruthTableRow[] = [];
  const edges = inputs.map((p) => edgeValues(p.width));
  const total = edges.reduce((n, e) => n * e.length, 1);
  if (total <= 512) {
    for (let k = 0; k < total; k++) {
      const ins: Ins = {};
      let rest = k;
      inputs.forEach((p, i) => {
        const e = edges[i]!;
        ins[p.name] = e[rest % e.length]!;
        rest = Math.floor(rest / e.length);
      });
      rows.push({ in: ins, out: fn(ins) });
    }
  }
  const rand = mulberry32(seed);
  for (let k = 0; k < samples; k++) {
    const ins: Ins = {};
    for (const p of inputs) ins[p.name] = Math.floor(rand() * 2 ** p.width);
    rows.push({ in: ins, out: fn(ins) });
  }
  return rows;
}

// ฟังก์ชันอ้างอิงสำหรับทดสอบวงจรที่ขาเข้ากว้างเกินจะทดสอบครบทุกกรณี (Spec ส่วน 7)
// อยู่ในโค้ดของ engine ไฟล์ด่านอ้างแค่ชื่อ จึงนำเข้าด่านจากคนอื่นได้โดยไม่ต้องรันโค้ดของเขา

import type { PinDef, TruthTableRow } from '@z-ncpu/shared';
import { MAX_EXHAUSTIVE_BITS, exhaustiveRows } from './rows';

type Ins = Record<string, number>;
export type ReferenceFn = (ins: Ins) => Record<string, number>;

const bit = (v: number | undefined): number => (v ?? 0) & 1;

export const REFERENCES: Readonly<Record<string, ReferenceFn>> = {
  /** sum = a + b + cin (8 บิต) */
  add8: ({ a = 0, b = 0, cin }) => {
    const s = a + b + bit(cin);
    return { sum: s & 0xff, cout: s >> 8 };
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

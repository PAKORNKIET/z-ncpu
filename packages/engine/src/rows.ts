// สร้างแถวของ truth table
import type { PinDef, SignalValue, TruthTableRow } from '@z-ncpu/shared';

/** input รวมไม่เกินกี่บิตจึงทดสอบครบทุกกรณีได้ (Spec ส่วน 7) */
export const MAX_EXHAUSTIVE_BITS = 16;

/** สร้างทุกแถวของ truth table จาก reference function (บิต 0 ของ input ตัวแรกเปลี่ยนเร็วสุด) */
export function exhaustiveRows(
  inputs: PinDef[],
  fn: (ins: Record<string, number>) => Record<string, SignalValue>,
): TruthTableRow[] {
  const totalBits = inputs.reduce((s, p) => s + p.width, 0);
  if (totalBits > MAX_EXHAUSTIVE_BITS) {
    throw new RangeError(`input รวม ${totalBits} บิต เกิน ${MAX_EXHAUSTIVE_BITS} บิตที่ทดสอบครบทุกกรณีได้`);
  }
  const rows: TruthTableRow[] = [];
  for (let combo = 0; combo < 2 ** totalBits; combo++) {
    const ins: Record<string, number> = {};
    let shift = 0;
    for (const p of inputs) {
      ins[p.name] = Math.floor(combo / 2 ** shift) % 2 ** p.width;
      shift += p.width;
    }
    rows.push({ in: { ...ins }, out: fn(ins) });
  }
  return rows;
}


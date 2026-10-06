import type { Bit } from '@z-ncpu/shared';

/** ค่า X (ยังไม่รู้ค่า) */
export const X = 2 as const;

/**
 * ตาราง NAND สามค่า ดัชนี = a * 3 + b
 * ขาใดเป็น 0 → 1, ทั้งสองขาเป็น 1 → 0, นอกนั้น → X
 */
export const NAND_TABLE: Uint8Array = new Uint8Array([
  // b: 0  1  X
  1, 1, 1, // a = 0
  1, 0, 2, // a = 1
  1, 2, 2, // a = X
]);

export function nand(a: Bit, b: Bit): Bit {
  return NAND_TABLE[a * 3 + b] as Bit;
}

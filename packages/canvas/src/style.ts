import type { Bit } from '@z-ncpu/shared';

export interface WireStyle {
  width: number;
  dash: number[];
  /** ชื่อ CSS variable ของสี */
  colorVar: string;
  label: string;
}

/**
 * สไตล์ของสายตามค่า (Spec ส่วน 16): บอกค่าด้วยความหนา ลายเส้น และป้าย ไม่ใช่สีอย่างเดียว
 * 1 = สว่างและหนา, 0 = จางและบาง, X = สีเทาเส้นประ
 */
export function wireStyle(value: Bit, busWidth = 1): WireStyle {
  const busBoost = busWidth > 1 ? 1.5 : 0;
  if (value === 1) return { width: 3 + busBoost, dash: [], colorVar: '--signal-high', label: 'HIGH' };
  if (value === 0) return { width: 2 + busBoost, dash: [], colorVar: '--signal-low', label: 'LOW' };
  return { width: 1.5 + busBoost, dash: [4, 4], colorVar: '--signal-unknown', label: 'X' };
}

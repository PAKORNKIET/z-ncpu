// @z-ncpu/canvas — renderer และเครื่องมือของ editor (Spec ส่วน 14)
// M0 มีแค่ interface กับสไตล์ของสาย; editor เต็มรูปมาใน M1

import type { Bit, ComponentDef } from '@z-ncpu/shared';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

/** renderer อยู่หลัง interface นี้ เปลี่ยนจาก Canvas 2D เป็น WebGL ภายหลังได้ */
export interface CircuitRenderer {
  /** วาดวงจรชั้นที่กำลังดู */
  setScope(def: ComponentDef): void;
  /** รับค่าสัญญาณที่เปลี่ยน (diff จาก Worker) แล้ววาดเฉพาะส่วนที่จำเป็น */
  applySignals(changes: ReadonlyMap<string, Bit>): void;
  setCamera(camera: Camera): void;
  resize(width: number, height: number, dpr: number): void;
  destroy(): void;
}

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
  if (value === 0) return { width: 1.5 + busBoost, dash: [], colorVar: '--signal-low', label: 'LOW' };
  return { width: 1.5 + busBoost, dash: [4, 4], colorVar: '--signal-unknown', label: 'X' };
}

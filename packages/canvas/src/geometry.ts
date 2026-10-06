// รูปทรงของชิ้นส่วนบนหน้าจอ: ขนาดกล่อง ตำแหน่งขา การหมุน และกล้อง (Spec ส่วน 14)
// ทุกอย่างเป็นพิกัดโลก (world) หน่วยเดียวกับ Instance.x/y ไม่ขึ้นกับ DOM จึงทดสอบได้ใน Node

import type { PinDef, Rotation } from '@z-ncpu/shared';

/** ระยะกริด ชิ้นส่วนและขาวางลงบนกริดนี้เสมอ */
export const GRID = 20;
/** ระยะห่างระหว่างขา */
export const PIN_PITCH = GRID * 2;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PinShape {
  name: string;
  dir: 'in' | 'out';
  width: number;
  /** ตำแหน่งขาเทียบกับจุดกลางชิ้น ก่อนหมุน */
  dx: number;
  dy: number;
}

export interface NodeShape {
  /** ขนาดก่อนหมุน */
  w: number;
  h: number;
  pins: PinShape[];
}

export const snap = (v: number): number => Math.round(v / GRID) * GRID;
export const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

/**
 * ขาเข้าอยู่ด้านซ้าย ขาออกอยู่ด้านขวา ห่างกัน PIN_PITCH
 * ด้านที่มีขาน้อยกว่าจัดไว้กลาง ขนาดเป็นทวีคูณของ GRID*2 เพื่อให้จุดกลางและขาอยู่บนกริดเสมอ
 */
export function nodeShape(pins: readonly PinDef[], minWidth = GRID * 4): NodeShape {
  const ins = pins.filter((p) => p.dir === 'in');
  const outs = pins.filter((p) => p.dir === 'out');
  const rows = Math.max(ins.length, outs.length, 1);
  const h = rows * PIN_PITCH;
  const w = Math.max(minWidth, GRID * 4);
  const side = (list: PinDef[], dx: number): PinShape[] =>
    list.map((p, i) => ({
      name: p.name,
      dir: p.dir,
      width: p.width,
      dx,
      dy: (i - (list.length - 1) / 2) * PIN_PITCH,
    }));
  return { w, h, pins: [...side(ins, -w / 2), ...side(outs, w / 2)] };
}

/** หมุนจุดรอบจุดกำเนิดตามเข็มนาฬิกา (แกน y ชี้ลงแบบหน้าจอ) */
export function rotate(p: Point, rotation: Rotation): Point {
  switch (rotation) {
    case 0:
      return p;
    // + 0 เปลี่ยน -0 เป็น 0
    case 90:
      return { x: -p.y + 0, y: p.x };
    case 180:
      return { x: -p.x + 0, y: -p.y + 0 };
    case 270:
      return { x: p.y, y: -p.x + 0 };
  }
}

export function rotatedSize(shape: NodeShape, rotation: Rotation): { w: number; h: number } {
  return rotation === 90 || rotation === 270 ? { w: shape.h, h: shape.w } : { w: shape.w, h: shape.h };
}

// ---------- กล้อง ----------

/** world → screen: screen = (world - camera.xy) * zoom */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

export const toWorld = (c: Camera, s: Point): Point => ({ x: s.x / c.zoom + c.x, y: s.y / c.zoom + c.y });
export const toScreen = (c: Camera, w: Point): Point => ({ x: (w.x - c.x) * c.zoom, y: (w.y - c.y) * c.zoom });

/** ซูมโดยให้จุดใต้เมาส์อยู่ที่เดิม */
export function zoomAt(c: Camera, screen: Point, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.zoom * factor));
  const anchor = toWorld(c, screen);
  return { zoom, x: anchor.x - screen.x / zoom, y: anchor.y - screen.y / zoom };
}

/** กล้องที่เห็นกรอบ bounds ทั้งหมดในจอขนาด width × height (ซูมไม่เกิน 1.5 เท่า) */
export function fitCamera(bounds: Rect, width: number, height: number, margin = 40): Camera {
  const zoom = Math.min(
    1.5,
    Math.max(MIN_ZOOM, Math.min((width - margin * 2) / Math.max(bounds.w, 1), (height - margin * 2) / Math.max(bounds.h, 1))),
  );
  return {
    zoom,
    x: bounds.x + bounds.w / 2 - width / 2 / zoom,
    y: bounds.y + bounds.h / 2 - height / 2 / zoom,
  };
}

/** ระยะจากจุดถึงส่วนของเส้นตรง */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

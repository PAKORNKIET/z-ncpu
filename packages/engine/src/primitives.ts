import type { LocalizedText, PinDef } from '@z-ncpu/shared';

export type PrimitiveKind = 'nand' | 'const0' | 'const1' | 'split' | 'merge' | 'clock' | 'panel';

export interface PrimitiveSpec {
  id: string;
  kind: PrimitiveKind;
  name: LocalizedText;
  /** pin อาจขึ้นกับ params เช่น width ของ split/merge โยน RangeError ถ้า params ไม่ถูก */
  pins(params?: Record<string, number>): PinDef[];
}

/** เพิ่มเมื่อพฤติกรรมของ primitive เปลี่ยน ทำให้ content hash ของทุกวงจรเปลี่ยนตาม */
export const PRIMITIVES_VERSION = 1;

/** bus ปกติกว้างไม่เกิน 16 บิต (UI แสดงค่าเป็นตัวเลข) */
export const BUS_WIDTH = 16;
/** มัดสาย (bundle) กว้างได้ถึง 4096 บิต ใช้ส่งข้อมูลโปรแกรมจากแผงค่าคงที่เข้า ROM (256 คำ × 16 บิต) */
export const MAX_WIDTH = 4096;

function intParam(params: Record<string, number> | undefined, key: string, min: number, max: number): number {
  const v = params?.[key];
  if (v === undefined || !Number.isInteger(v) || v < min || v > max) {
    throw new RangeError(`${key} ต้องเป็นจำนวนเต็ม ${min}..${max}`);
  }
  return v;
}

/**
 * split/merge แบ่ง bus กว้าง width เป็น parts ส่วนเท่าๆ กัน (ค่าเริ่มต้น parts = width คือแยกทีละบิต)
 * ส่วนที่ i ชื่อ b{i} และ b0 คือบิตต่ำสุด
 */
function splitShape(params: Record<string, number> | undefined): { width: number; parts: number; partWidth: number } {
  const width = intParam(params, 'width', 1, MAX_WIDTH);
  const parts = params?.parts === undefined ? width : intParam(params, 'parts', 1, width);
  if (width % parts !== 0) throw new RangeError(`width ${width} แบ่งเป็น ${parts} ส่วนเท่ากันไม่ได้`);
  return { width, parts, partWidth: width / parts };
}

const partPins = (parts: number, partWidth: number, dir: 'in' | 'out'): PinDef[] =>
  Array.from({ length: parts }, (_, i) => ({ name: `b${i}`, dir, width: partWidth }));

/** ขนาดของแผงค่าคงที่: words คำ คำละ width บิต รวมไม่เกิน MAX_WIDTH */
export function panelShape(params: Record<string, number> | undefined): { words: number; width: number } {
  const width = intParam(params, 'width', 1, BUS_WIDTH);
  const words = intParam(params, 'words', 1, Math.floor(MAX_WIDTH / width));
  return { words, width };
}

const specs: PrimitiveSpec[] = [
  {
    id: 'prim.nand',
    kind: 'nand',
    name: { th: 'เกต NAND', en: 'NAND gate' },
    pins: () => [
      { name: 'a', dir: 'in', width: 1 },
      { name: 'b', dir: 'in', width: 1 },
      { name: 'y', dir: 'out', width: 1 },
    ],
  },
  {
    id: 'prim.const0',
    kind: 'const0',
    name: { th: 'ค่าคงที่ 0', en: 'Constant 0' },
    pins: () => [{ name: 'y', dir: 'out', width: 1 }],
  },
  {
    id: 'prim.const1',
    kind: 'const1',
    name: { th: 'ค่าคงที่ 1', en: 'Constant 1' },
    pins: () => [{ name: 'y', dir: 'out', width: 1 }],
  },
  {
    id: 'prim.split',
    kind: 'split',
    name: { th: 'แยก bus', en: 'Splitter' },
    pins: (params) => {
      const s = splitShape(params);
      return [{ name: 'in', dir: 'in', width: s.width }, ...partPins(s.parts, s.partWidth, 'out')];
    },
  },
  {
    id: 'prim.merge',
    kind: 'merge',
    name: { th: 'รวม bus', en: 'Merger' },
    pins: (params) => {
      const s = splitShape(params);
      return [...partPins(s.parts, s.partWidth, 'in'), { name: 'out', dir: 'out', width: s.width }];
    },
  },
  {
    id: 'prim.clock',
    kind: 'clock',
    name: { th: 'สัญญาณนาฬิกา', en: 'Clock' },
    pins: () => [{ name: 'clk', dir: 'out', width: 1 }],
  },
  {
    // แผงค่าคงที่: สวิตช์ 0/1 จำนวนมากที่ assembler ตั้งค่าให้ตามโปรแกรม (เหมือนแผงสวิตช์ของคอมพิวเตอร์ยุคแรก)
    // ไม่มีเกตข้างใน ข้อมูลโปรแกรมไม่อยู่ใน def จึงแก้โปรแกรมได้โดยไม่ทำให้ต้องทดสอบวงจรใหม่
    // คำที่ i อยู่ที่บิต i*width .. i*width+width-1 ของ out
    id: 'prim.panel',
    kind: 'panel',
    name: { th: 'แผงค่าคงที่', en: 'Constant panel' },
    pins: (params) => {
      const { words, width } = panelShape(params);
      return [{ name: 'out', dir: 'out', width: words * width }];
    },
  },
];

export const PRIMITIVES: ReadonlyMap<string, PrimitiveSpec> = new Map(specs.map((s) => [s.id, s]));

export function isPrimitive(defId: string): boolean {
  return PRIMITIVES.has(defId);
}

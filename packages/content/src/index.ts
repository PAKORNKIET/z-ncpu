// @z-ncpu/content — ด่าน บทเรียน คำใบ้ และ glossary (Spec ส่วน 13, 16)
// ไฟล์ข้อมูลล้วน ไม่มีโค้ดที่ต้องรัน จึงนำเข้าด่านจากคนอื่นได้อย่างปลอดภัย
// หมายเหตุ: solutions/ ใช้ใน CI เท่านั้น ห้าม import จากที่นี่ เพื่อไม่ให้เฉลยติดไปกับแอป

import type { GlossaryEntry, LevelDef } from '@z-ncpu/shared';
import glossaryJson from '../i18n/glossary.json';
import hintsTh from '../i18n/hints.th.json';
import andLevel from '../levels/1-logic/and.json';
import demuxLevel from '../levels/1-logic/demux.json';
import muxLevel from '../levels/1-logic/mux.json';
import norLevel from '../levels/1-logic/nor.json';
import xnorLevel from '../levels/1-logic/xnor.json';
import notLevel from '../levels/1-logic/not.json';
import orLevel from '../levels/1-logic/or.json';
import xorLevel from '../levels/1-logic/xor.json';
import alu_and8Level from '../levels/3-alu/and8.json';
import alu_or8Level from '../levels/3-alu/or8.json';
import alu_xor8Level from '../levels/3-alu/xor8.json';
import alu_mux8Level from '../levels/3-alu/mux8.json';
import alu_sel4Level from '../levels/3-alu/sel4.json';
import alu_sel8Level from '../levels/3-alu/sel8.json';
import alu_alu8Level from '../levels/3-alu/alu8.json';
import state_bitLevel from '../levels/4-state/bit.json';
import state_reg8Level from '../levels/4-state/reg8.json';
import state_counter8Level from '../levels/4-state/counter8.json';
import mem_demux4Level from '../levels/5-memory/demux4.json';
import mem_demux8Level from '../levels/5-memory/demux8.json';
import mem_ram8Level from '../levels/5-memory/ram8.json';
import mem_ram64Level from '../levels/5-memory/ram64.json';
import mem_ram256Level from '../levels/5-memory/ram256.json';
import mem_mux16Level from '../levels/5-memory/mux16.json';
import mem_rom8Level from '../levels/5-memory/rom8.json';
import mem_rom64Level from '../levels/5-memory/rom64.json';
import mem_rom256Level from '../levels/5-memory/rom256.json';
import control_pcLevel from '../levels/6-control/pc.json';
import io_seg7Level from '../levels/6-control/seg7.json';
import control_decoderLevel from '../levels/6-control/decoder.json';
import control_regfileLevel from '../levels/6-control/regfile.json';
import control_spLevel from '../levels/6-control/sp.json';
import add4Level from '../levels/2-arith/add4.json';
import add8Level from '../levels/2-arith/add8.json';
import eq8Level from '../levels/2-arith/eq8.json';
import inc8Level from '../levels/2-arith/inc8.json';
import negateLevel from '../levels/2-arith/negate.json';
import not8Level from '../levels/2-arith/not8.json';
import sub8Level from '../levels/2-arith/sub8.json';
import zero8Level from '../levels/2-arith/zero8.json';
import fullAdderLevel from '../levels/2-arith/full-adder.json';
import halfAdderLevel from '../levels/2-arith/half-adder.json';
import dLatchLevel from '../levels/4-state/d-latch.json';
import dffLevel from '../levels/4-state/dff.json';
import srLatchLevel from '../levels/4-state/sr-latch.json';

/** ด่านเรียงตามลำดับที่เล่น */
export const LEVELS: LevelDef[] = [
  notLevel,
  andLevel,
  orLevel,
  norLevel,
  xorLevel,
  xnorLevel,
  muxLevel,
  demuxLevel,
  halfAdderLevel,
  fullAdderLevel,
  add4Level,
  add8Level,
  not8Level,
  inc8Level,
  negateLevel,
  sub8Level,
  zero8Level,
  eq8Level,
  alu_and8Level,
  alu_or8Level,
  alu_xor8Level,
  alu_mux8Level,
  alu_sel4Level,
  alu_sel8Level,
  alu_alu8Level,
  srLatchLevel,
  dLatchLevel,
  dffLevel,
  state_bitLevel,
  state_reg8Level,
  state_counter8Level,
  mem_demux4Level,
  mem_demux8Level,
  mem_ram8Level,
  mem_ram64Level,
  mem_ram256Level,
  mem_mux16Level,
  mem_rom8Level,
  mem_rom64Level,
  mem_rom256Level,
  control_pcLevel,
  io_seg7Level,
  control_decoderLevel,
  control_regfileLevel,
  control_spLevel,
] as LevelDef[];

/** ชื่อบท (เลขบทตามหลักสูตรใน Spec ส่วน 12 บทที่ยังไม่มีด่านจะไม่แสดง) */
export const CHAPTERS: Record<number, { th: string; en: string }> = {
  1: { th: 'ตรรกะพื้นฐาน', en: 'Basic logic' },
  2: { th: 'การบวกเลข', en: 'Arithmetic' },
  3: { th: 'ALU', en: 'ALU' },
  4: { th: 'วงจรจำค่า', en: 'State' },
  5: { th: 'หน่วยความจำ', en: 'Memory' },
  6: { th: 'ควบคุมและอุปกรณ์', en: 'Control & I/O' },
};

export const GLOSSARY: GlossaryEntry[] = glossaryJson;

export const HINTS_TH: Record<string, string> = hintsTh;

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** แสดงศัพท์แบบ "ไทย (English)" ตามข้อ 20 */
export function term(id: string): string {
  const g = GLOSSARY.find((e) => e.id === id);
  return g ? `${g.th} (${g.en})` : id;
}

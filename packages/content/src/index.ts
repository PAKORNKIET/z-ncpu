// @z-ncpu/content — ด่าน บทเรียน คำใบ้ และ glossary (Spec ส่วน 13, 16)
// ไฟล์ข้อมูลล้วน ไม่มีโค้ดที่ต้องรัน จึงนำเข้าด่านจากคนอื่นได้อย่างปลอดภัย
// หมายเหตุ: solutions/ ใช้ใน CI เท่านั้น ห้าม import จากที่นี่ เพื่อไม่ให้เฉลยติดไปกับแอป

import type { GlossaryEntry, LevelDef } from '@z-ncpu/shared';
import glossaryJson from '../i18n/glossary.json';
import hintsTh from '../i18n/hints.th.json';
import andLevel from '../levels/1-logic/and.json';
import notLevel from '../levels/1-logic/not.json';

/** ด่านเรียงตามลำดับที่เล่น */
export const LEVELS: LevelDef[] = [notLevel, andLevel] as LevelDef[];

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

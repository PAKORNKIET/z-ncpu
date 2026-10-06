// กติกาของระบบด่าน (Spec ส่วน 13): ปลดล็อกทีละด่าน ชิ้นที่ผ่านแล้วใช้ในด่านถัดไปได้
// และถ้าแก้วงจรที่เคยผ่าน (hash เปลี่ยน) ต้องทดสอบใหม่
// pure function ล้วน: รับ save เดิม คืน save ใหม่

import type { ComponentDef, LevelDef } from '@z-ncpu/shared';
import type { SaveFile } from './save';

export type LevelStatus = 'locked' | 'open' | 'passed' | 'retest';

/** content hash ของวงจรผู้เล่น (app ส่ง contentHash ของ engine มา) */
export type HashOf = (components: readonly ComponentDef[], defId: string) => string;

export const componentOf = (save: SaveFile, defId: string): ComponentDef | undefined =>
  save.components.find((c) => c.id === defId);

/** ด่านแรกเปิดเสมอ ด่านถัดไปเปิดเมื่อด่านก่อนหน้าเคยผ่าน */
export function isUnlocked(levels: readonly LevelDef[], index: number, save: SaveFile): boolean {
  if (index <= 0) return true;
  const prev = levels[index - 1];
  return !!prev && !!save.progress[prev.id]?.passedHash;
}

export function levelStatus(levels: readonly LevelDef[], index: number, save: SaveFile, hashOf: HashOf): LevelStatus {
  const level = levels[index];
  if (!level || !isUnlocked(levels, index, save)) return 'locked';
  const passed = save.progress[level.id]?.passedHash;
  if (!passed) return 'open';
  if (!componentOf(save, level.target.defId)) return 'retest';
  return hashOf(save.components, level.target.defId) === passed ? 'passed' : 'retest';
}

/** ชิ้นที่วางได้ในด่าน: primitive ที่ด่านอนุญาต + ชิ้นของผู้เล่นที่ด่านอนุญาตและเคยผ่านแล้ว */
export function availableParts(level: LevelDef, levels: readonly LevelDef[], save: SaveFile): string[] {
  const unlocked = new Set(
    levels.filter((l) => save.progress[l.id]?.passedHash && componentOf(save, l.target.defId)).flatMap((l) => l.unlocks),
  );
  return level.available.filter((id) => id.startsWith('prim.') || unlocked.has(id));
}

/** ชื่อของชิ้นที่ผู้เล่นสร้าง เช่น user.not → NOT */
export const partName = (defId: string): string => (defId.split('.').pop() ?? defId).toUpperCase();

/** วงจรที่กำลังทำในด่านนี้ (ร่างที่บันทึกไว้ หรือวงจรเปล่าตาม pin ที่ด่านกำหนด) */
export function draftFor(level: LevelDef, save: SaveFile): ComponentDef {
  const existing = componentOf(save, level.target.defId);
  if (existing) return existing;
  const n = partName(level.target.defId);
  return {
    id: level.target.defId,
    name: { th: n, en: n },
    kind: 'circuit',
    pins: level.target.pins.map((p) => ({ ...p })),
    body: { instances: [], wires: [] },
  };
}

const touch = (save: SaveFile): SaveFile => ({ ...save, project: { ...save.project, updatedAt: new Date().toISOString() } });

/** บันทึกร่างของวงจร (แทนที่ตัวเดิมที่ id เดียวกัน) */
export function putComponent(save: SaveFile, def: ComponentDef): SaveFile {
  const i = save.components.findIndex((c) => c.id === def.id);
  const components = i === -1 ? [...save.components, def] : save.components.map((c, k) => (k === i ? def : c));
  return touch({ ...save, components });
}

/** บันทึกผลการทดสอบ ถ้าผ่านเก็บ hash ของวงจรตอนนั้น และจำนวน NAND ที่น้อยที่สุด */
export function recordTest(save: SaveFile, levelId: string, result: { passed: boolean; hash: string; nand: number }): SaveFile {
  const prev = save.progress[levelId] ?? { attempts: 0 };
  const next = { ...prev, attempts: prev.attempts + 1 };
  if (result.passed) {
    next.passedHash = result.hash;
    next.bestNand = Math.min(prev.bestNand ?? Infinity, result.nand);
  }
  return touch({ ...save, progress: { ...save.progress, [levelId]: next } });
}

/** ด่านแรกที่ยังไม่ผ่าน (ใช้เปิดตอนเริ่ม) */
export function firstUnfinished(levels: readonly LevelDef[], save: SaveFile): number {
  const i = levels.findIndex((l) => !save.progress[l.id]?.passedHash);
  return i === -1 ? Math.max(0, levels.length - 1) : i;
}

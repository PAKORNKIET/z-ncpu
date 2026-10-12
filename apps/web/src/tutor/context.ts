// สร้าง "โจทย์" ของด่านให้ติวเตอร์ จากบทเรียนและสิ่งที่ด่านทดสอบ (เนื้อหาของเกมเอง ไม่ใช่ข้อมูลผู้เล่น)
import type { LevelDef } from '@z-ncpu/shared';
import { CHAPTERS } from '@z-ncpu/content';
import { lessonText } from '../game/lessons';

const TEST_KIND: Record<LevelDef['tests']['type'], string> = {
  'truth-table': 'ตรวจด้วยตารางความจริง',
  sequence: 'ตรวจเป็นลำดับเวลา (ตั้งค่าขาเข้า เดินนาฬิกา แล้วดูขาออก)',
  reference: 'เทียบกับฟังก์ชันอ้างอิงทั้งกรณีขอบและสุ่ม',
  rom: 'ใส่ข้อมูลสุ่มลงแผงแล้วอ่านทุก address',
  cpu: 'รันโปรแกรมทดสอบแล้วเทียบ register และ flags กับ emulator ทุก cycle',
  program: 'รันโปรแกรมของผู้เล่นบน CPU ที่ผู้เล่นต่อเอง แล้วดูว่าจอ/LED แสดงตามโจทย์',
};

export const levelPlace = (level: LevelDef): string => `ด่าน "${level.title.th}" บทที่ ${level.chapter} (${CHAPTERS[level.chapter]?.th ?? ''})`;

export function levelGoal(level: LevelDef): string {
  const lesson = (lessonText('th', level.lesson) ?? '').replace(/^#\s+.*\n/, '').trim();
  const excerpt = lesson.length > 1200 ? `${lesson.slice(0, 1200)}…` : lesson;
  const pins = level.target.pins.map((p) => `${p.name}${p.width > 1 ? `[${p.width}]` : ''} (${p.dir === 'in' ? 'เข้า' : 'ออก'})`).join(', ');
  return [excerpt, pins ? `ขาที่วงจรต้องมี: ${pins}` : '', `วิธีตรวจ: ${TEST_KIND[level.tests.type]}`].filter(Boolean).join('\n\n');
}

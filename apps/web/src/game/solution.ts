// เฉลยของด่าน: โหลดแยกไฟล์เฉพาะตอนผู้เล่นกด "ดูเฉลย" (ไม่อยู่ในไฟล์หลักของแอป)
// ไฟล์เฉลยเป็นข้อมูลของเกมเอง (ไม่ใช่ไฟล์จากข้างนอก) Level CI ตรวจทุกไฟล์ว่าผ่านด่านจริง
import type { ComponentDef } from '@z-ncpu/shared';

const solutionFiles = import.meta.glob<{ default: unknown }>('../../../../packages/content/solutions/*.json');
const explainFiles = import.meta.glob<string>('../../../../packages/content/explain/th/*.md', { query: '?raw', import: 'default' });

const key = (path: string): string => /([^/]+)\.(json|md)$/.exec(path)?.[1] ?? '';
const solutions = new Map(Object.entries(solutionFiles).map(([p, load]) => [key(p), load]));
const explains = new Map(Object.entries(explainFiles).map(([p, load]) => [key(p), load]));

export type Solution = { kind: 'circuit'; def: ComponentDef } | { kind: 'program'; source: string };

export async function loadSolution(levelId: string): Promise<Solution | null> {
  const load = solutions.get(levelId);
  if (!load) return null;
  const data = (await load()).default as ComponentDef | { source: string };
  return 'source' in data ? { kind: 'program', source: data.source } : { kind: 'circuit', def: data };
}

export async function loadExplanation(levelId: string): Promise<string | null> {
  const load = explains.get(levelId);
  return load ? await load() : null;
}

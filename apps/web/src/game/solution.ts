// เฉลยของด่าน: โหลดเฉพาะตอนผู้เล่นกด "ดูเฉลย" (ไม่อยู่ในไฟล์หลักของแอป)
// ไฟล์เฉลยเป็นข้อมูลของเกมเอง Level CI ตรวจทุกไฟล์ว่าผ่านด่านจริง
// ใช้ fetch ไฟล์ข้อมูล ไม่ใช้ import() เพราะ import() ที่ล้มครั้งหนึ่ง (เน็ตหลุด, เกมกำลังอัปเดต) เบราว์เซอร์จำไว้ว่าล้มตลอด กดลองใหม่ก็ไม่หาย
import type { ComponentDef } from '@z-ncpu/shared';

const solutionUrls = import.meta.glob<string>('../../../../packages/content/solutions/*.json', { query: '?url', import: 'default', eager: true });
const explainUrls = import.meta.glob<string>('../../../../packages/content/explain/th/*.md', { query: '?url', import: 'default', eager: true });

const key = (path: string): string => /([^/]+)\.(json|md)$/.exec(path)?.[1] ?? '';
const solutions = new Map(Object.entries(solutionUrls).map(([p, url]) => [key(p), url]));
const explains = new Map(Object.entries(explainUrls).map(([p, url]) => [key(p), url]));

export type Solution = { kind: 'circuit'; def: ComponentDef } | { kind: 'program'; source: string };

/** โหลดสำเร็จแล้วจำไว้ (เปิดซ้ำไม่ต้องโหลดใหม่) ส่วนที่ล้มไม่จำ จะได้ลองใหม่ได้ */
const cache = new Map<string, Promise<unknown>>();

function get<T>(url: string, read: (r: Response) => Promise<T>): Promise<T> {
  const hit = cache.get(url) as Promise<T> | undefined;
  if (hit) return hit;
  const p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return read(r);
  });
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

export async function loadSolution(levelId: string): Promise<Solution | null> {
  const url = solutions.get(levelId);
  if (!url) return null;
  const data = await get(url, (r) => r.json() as Promise<ComponentDef | { source: string }>);
  return 'source' in data ? { kind: 'program', source: data.source } : { kind: 'circuit', def: data };
}

export async function loadExplanation(levelId: string): Promise<string | null> {
  const url = explains.get(levelId);
  return url ? get(url, (r) => r.text()) : null;
}

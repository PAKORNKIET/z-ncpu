// ตัวช่วยร่วมของ E2E: เก็บ error ใน console, อ่านตำแหน่งขาบนจอ, ต่อสาย, วางชิ้น และใส่ความคืบหน้าล่วงหน้า
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IGNORED = [/fonts\.(googleapis|gstatic)\.com/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_INTERNET_DISCONNECTED/];

/** เริ่มเก็บ error ของหน้า คืนฟังก์ชันที่ตรวจว่าไม่มี error */
export function watchErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()) || re.test(m.location().url))) errors.push(m.text());
  });
  return () => expect(errors, 'ไม่ควรมี error ใน console').toEqual([]);
}

type TestWindow = { __zncpuTest?: { pin(inst: string, pin: string): { x: number; y: number } | undefined } };
const SOLUTIONS = join(import.meta.dirname, '..', 'packages', 'content', 'solutions');
export const solution = (id: string): unknown => JSON.parse(readFileSync(join(SOLUTIONS, `${id}.json`), 'utf8'));

export const level = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^ด่าน ${n} `) });
export const levelNamed = (page: Page, title: RegExp) => page.locator('.level-item').filter({ hasText: title });
export const canvas = (page: Page) => page.getByRole('application');

/** เปิดแอปโดยมีความคืบหน้าเหมือนผ่านด่านเหล่านี้แล้ว (และร่างวงจร: id ของด่านเพื่อใช้เฉลย หรือวงจรที่แก้แล้ว) */
export async function openWithSave(page: Page, passed: string[], drafts: (string | object)[] = []): Promise<void> {
  const save = {
    format: 'zncpu',
    schemaVersion: 1,
    project: { id: 'local', name: 'e2e' },
    components: [...passed.filter((id) => !id.startsWith('prog.')).map(solution), ...drafts.map((d) => (typeof d === 'string' ? solution(d) : d))],
    progress: Object.fromEntries(passed.map((id) => [id, { attempts: 1, passedHash: '0' }])),
  };
  // ใส่ก่อนแอปเริ่ม (แอปบันทึกตอนปิดหน้า ถ้าใส่แล้วรีโหลด ข้อมูลในแอปจะเขียนทับ)
  await page.addInitScript((text) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    localStorage.setItem('zncpu.save.v1', text);
    sessionStorage.setItem('e2e-seeded', '1');
  }, JSON.stringify(save));
  await page.goto('/?test');
  // ด่านเขียนโปรแกรมไม่มีพื้นที่ต่อวงจร ให้รอช่องเขียนโปรแกรมแทน
  await expect(page.locator('canvas[role="application"], .program-editor').first()).toBeVisible();
}

export async function pinAt(page: Page, inst: string, pin: string) {
  const p = await page.evaluate(([i, n]) => (window as unknown as TestWindow).__zncpuTest?.pin(i!, n!), [inst, pin]);
  if (!p) throw new Error(`ไม่พบขา ${inst}.${pin}`);
  return p;
}

export async function wire(page: Page, a: [string, string], b: [string, string]): Promise<void> {
  const p = await pinAt(page, ...a);
  const q = await pinAt(page, ...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 6 });
  await page.mouse.up();
}

export async function place(page: Page, part: RegExp, fx: number, fy: number): Promise<void> {
  await page.locator('.palette').getByRole('button', { name: part }).click();
  const box = (await canvas(page).boundingBox())!;
  await canvas(page).click({ position: { x: box.width * fx, y: box.height * fy } });
}

/** ชื่อด่านที่ต้องผ่านก่อนถึงด่านนี้ (ตามลำดับในเกม) */
export const ORDER = [
  'logic.not',
  'logic.and',
  'logic.or',
  'logic.nor',
  'logic.xor',
  'logic.xnor',
  'logic.mux',
  'logic.demux',
  'arith.half-adder',
  'arith.full-adder',
  'arith.add4',
  'arith.add8',
  'arith.not8',
  'arith.inc8',
  'arith.negate',
  'arith.sub8',
  'arith.zero8',
  'arith.eq8',
  'alu.and8',
  'alu.or8',
  'alu.xor8',
  'alu.mux8',
  'alu.sel4',
  'alu.sel8',
  'alu.alu8',
  'memory.sr-latch',
  'memory.d-latch',
  'memory.dff',
  'state.bit',
  'state.reg8',
  'state.counter8',
  'mem.demux4',
  'mem.demux8',
  'mem.ram8',
  'mem.ram64',
  'mem.ram256',
  'mem.mux16',
  'mem.rom8',
  'mem.rom64',
  'mem.rom256',
  'control.pc',
  'io.seg7',
  'control.decoder',
  'control.regfile',
  'control.sp',
  'cpu.z8',
  'prog.hello',
  'prog.countdown',
  'prog.sum',
  'prog.max',
  'prog.reverse',
  'prog.triple',
  'prog.bits',
];
export const before = (id: string): string[] => ORDER.slice(0, ORDER.indexOf(id));

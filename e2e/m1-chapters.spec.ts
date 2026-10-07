// ด่านบทที่ 2–3 (M1-5): บัส 4 บิต + ตัวแยก/รวมบัส, วงจรจำค่าที่ทดสอบเป็นลำดับเวลา และปุ่มเดินนาฬิกา
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IGNORED = [/fonts\.(googleapis|gstatic)\.com/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_INTERNET_DISCONNECTED/];
let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()) || re.test(m.location().url))) errors.push(m.text());
  });
  await page.goto('/?test');
});

test.afterEach(() => {
  expect(errors, 'ไม่ควรมี error ใน console').toEqual([]);
});

type TestWindow = { __zncpuTest?: { pin(inst: string, pin: string): { x: number; y: number } | undefined } };
const SOLUTIONS = join(import.meta.dirname, '..', 'packages', 'content', 'solutions');
const solution = (id: string): unknown => JSON.parse(readFileSync(join(SOLUTIONS, `${id}.json`), 'utf8'));
const level = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^ด่าน ${n} `) });
const canvas = (page: Page) => page.getByRole('application');

/** ใส่ความคืบหน้าลงเครื่องให้เหมือนเล่นผ่านด่านเหล่านี้แล้ว (และร่างวงจรของด่านที่ระบุ) แล้วโหลดหน้าใหม่ */
async function seed(page: Page, passed: string[], drafts: string[] = []) {
  const progress = Object.fromEntries(passed.map((id) => [id, { attempts: 1, passedHash: '0' }]));
  const save = {
    format: 'zncpu',
    schemaVersion: 1,
    project: { id: 'local', name: 'e2e' },
    components: [...passed, ...drafts].map(solution),
    progress,
  };
  // ใส่ก่อนแอปเริ่ม (แอปบันทึกตอนปิดหน้า ถ้าใส่แล้วรีโหลด ข้อมูลเดิมในแอปจะเขียนทับ)
  await page.addInitScript((text) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    localStorage.setItem('zncpu.save.v1', text);
    sessionStorage.setItem('e2e-seeded', '1');
  }, JSON.stringify(save));
  await page.goto('/?test');
}

async function pinAt(page: Page, inst: string, pin: string) {
  const p = await page.evaluate(([i, n]) => (window as unknown as TestWindow).__zncpuTest?.pin(i!, n!), [inst, pin]);
  if (!p) throw new Error(`ไม่พบขา ${inst}.${pin}`);
  return p;
}

async function wire(page: Page, a: [string, string], b: [string, string]) {
  const p = await pinAt(page, ...a);
  const q = await pinAt(page, ...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 6 });
  await page.mouse.up();
}

async function place(page: Page, part: RegExp, fx: number, fy: number) {
  await page.locator('.palette').getByRole('button', { name: part }).click();
  const box = (await canvas(page).boundingBox())!;
  await canvas(page).click({ position: { x: box.width * fx, y: box.height * fy } });
}

const ARITH8 = [
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
];
const BEFORE_ADD4 = [
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
];

test('มีด่านครบทุกบท และล็อกตามลำดับ', async ({ page }) => {
  for (const ch of ['ตรรกะพื้นฐาน', 'การบวกเลข', 'ALU', 'วงจรจำค่า', 'หน่วยความจำ', 'ควบคุมและอุปกรณ์']) await expect(page.getByRole('heading', { name: new RegExp(ch) })).toBeVisible();
  await expect(page.locator('.level-item')).toHaveCount(53);
  await expect(level(page, 3)).toBeDisabled();
  await seed(page, ['logic.not', 'logic.and']);
  await expect(level(page, 3)).toBeEnabled();
  await expect(level(page, 4)).toBeDisabled();
});

test('บวกเลข 4 บิต: บัส ตัวแยก/รวมบัส และทดสอบครบ 512 แบบ', async ({ page }) => {
  await seed(page, BEFORE_ADD4, ['arith.add4']);
  await page.locator('.level-item').filter({ hasText: /บวกเลข 4 บิต/ }).click();
  await expect(page.locator('.lesson')).toContainText('บัส');
  for (const part of [/^แยก bus/, /^รวม bus/, /^Full Adder/]) await expect(page.locator('.palette').getByRole('button', { name: part })).toBeVisible();
  await expect(page.getByTestId('nand-count')).toHaveText('36');

  // ตั้ง a = 5 (0101) b = 9 (1001) ทีละบิต → sum = 14, cout = 0
  await page.getByRole('button', { name: 'a บิต 0' }).click();
  await page.getByRole('button', { name: 'a บิต 2' }).click();
  await page.getByRole('button', { name: 'b บิต 0' }).click();
  await page.getByRole('button', { name: 'b บิต 3' }).click();
  await expect(page.getByRole('status', { name: /^sum = / })).toHaveAttribute('aria-label', 'sum = 14 (1110)');
  await expect(page.getByRole('status', { name: /^cout = / })).toHaveAttribute('aria-label', 'cout = 0 LOW');
  // a: 0101 → 1001 (9), b: 1001 → 1000 (8) แล้ว 9 + 8 + 0 = 17 → sum 1, cout 1
  await page.getByRole('button', { name: 'a บิต 2' }).click();
  await page.getByRole('button', { name: 'a บิต 3' }).click();
  await page.getByRole('button', { name: 'b บิต 0' }).click();
  await expect(page.locator('.bus-input').first()).toContainText('a = 9');
  await expect(page.getByRole('status', { name: /^sum = / })).toHaveAttribute('aria-label', 'sum = 1 (0001)');
  await expect(page.getByRole('status', { name: /^cout = / })).toHaveAttribute('aria-label', 'cout = 1 HIGH');

  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
  await expect(page.locator('.test-result')).toContainText('น้อยที่สุดที่ทำได้แล้ว');
  await expect(page.locator('.truth-table tbody tr')).toHaveCount(512);

  // วางตัวแยกบัสจากกล่องชิ้นส่วน: ได้ตัวแยก 4 บิต (บันทึกลงเครื่องพร้อม params)
  await place(page, /^แยก bus/, 0.15, 0.85);
  await expect
    .poll(() =>
      page.evaluate(() => {
        type Save = { components: { id: string; body: { instances: { defId: string; params?: { width: number } }[] } }[] };
        const save = JSON.parse(localStorage.getItem('zncpu.save.v1') ?? '{"components":[]}') as Save;
        return save.components.find((c) => c.id === 'user.add4')?.body.instances.filter((i) => i.defId === 'prim.split').length;
      }),
    )
    .toBe(3);
});

test('D Flip-Flop: ต่อจาก D Latch สองตัว ใช้ปุ่มเดินนาฬิกา แล้วผ่านการทดสอบตามลำดับเวลา', async ({ page }) => {
  await seed(page, [...BEFORE_ADD4, 'arith.add4', ...ARITH8, 'memory.sr-latch', 'memory.d-latch']);
  await page.locator('.level-item').filter({ hasText: /D Flip-Flop/ }).click();
  await expect(page.locator('.lesson')).toContainText('ขอบขาขึ้น');
  // ตารางลำดับเวลาแสดงก่อนทดสอบ
  await expect(page.getByRole('table', { name: 'ลำดับการทดสอบ' })).toBeVisible();

  await place(page, /^NOT/, 0.3, 0.75);
  await place(page, /^D Latch/, 0.45, 0.35);
  await place(page, /^D Latch/, 0.65, 0.5);
  await wire(page, ['self', 'clk'], ['not1', 'a']);
  await wire(page, ['self', 'd'], ['dlatch1', 'd']);
  await wire(page, ['not1', 'y'], ['dlatch1', 'e']);
  await wire(page, ['dlatch1', 'q'], ['dlatch2', 'd']);
  await wire(page, ['self', 'clk'], ['dlatch2', 'e']);
  await wire(page, ['dlatch2', 'q'], ['self', 'q']);
  await expect(page.getByTestId('wire-count')).toHaveText('6');
  await expect(page.getByTestId('nand-count')).toHaveText('9');

  const q = page.getByRole('status', { name: /^q = / });
  const tick = page.getByRole('button', { name: /เดินนาฬิกา/ });
  await page.getByRole('button', { name: /^สวิตช์ d / }).click(); // d = 1
  await tick.click();
  await expect(q).toHaveAttribute('aria-label', 'q = 1 HIGH');
  await page.getByRole('button', { name: /^สวิตช์ d / }).click(); // d = 0 แต่ยังไม่เดินนาฬิกา
  await expect(q).toHaveAttribute('aria-label', 'q = 1 HIGH');
  await tick.click();
  await expect(q).toHaveAttribute('aria-label', 'q = 0 LOW');

  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
});

test('SR Latch ที่ต่อผิด: ตารางลำดับเวลาบอกขั้นที่ผิด', async ({ page }) => {
  await seed(page, [...BEFORE_ADD4, 'arith.add4', ...ARITH8]);
  await page.locator('.level-item').filter({ hasText: /SR Latch/ }).click();
  // NAND ตัวเดียวไม่ใช่วงจรจำค่า
  await place(page, /^NAND/, 0.5, 0.5);
  await wire(page, ['self', 's'], ['nand1', 'a']);
  await wire(page, ['self', 'r'], ['nand1', 'b']);
  await wire(page, ['nand1', 'y'], ['self', 'q']);
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ยังไม่ผ่าน');
  await expect(page.locator('.test-result')).toContainText('ดูขั้นที่');
  await expect(page.locator('.truth-table tr.fail').first()).toBeVisible();
});

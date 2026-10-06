// ระบบด่าน (M1-3): เล่น NOT → ปลดล็อก → เล่น AND ด้วย NOT ที่สร้างเอง, บันทึกในเครื่อง, ไฟล์บันทึก
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const IGNORED = [/fonts\.(googleapis|gstatic)\.com/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_INTERNET_DISCONNECTED/];
let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()) || re.test(m.location().url))) errors.push(m.text());
  });
  page.on('dialog', (d) => void d.accept());
  await page.goto('/?test');
  await expect(page.getByRole('application')).toBeVisible();
});

test.afterEach(() => {
  expect(errors, 'ไม่ควรมี error ใน console').toEqual([]);
});

type TestWindow = { __zncpuTest?: { pin(inst: string, pin: string): { x: number; y: number } | undefined } };
const canvas = (page: Page) => page.getByRole('application');
const level = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^ด่าน ${n} `) });

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

async function buildNot(page: Page) {
  await place(page, /^NAND/, 0.5, 0.5);
  await wire(page, ['self', 'a'], ['nand1', 'a']);
  await wire(page, ['self', 'a'], ['nand1', 'b']);
  await wire(page, ['nand1', 'y'], ['self', 'y']);
}

test('เล่นด่าน NOT แล้วด่าน AND ใช้ NOT ที่สร้างเองได้ และความคืบหน้าอยู่หลังรีโหลด', async ({ page }) => {
  await expect(level(page, 1)).toHaveAttribute('aria-label', /ยังไม่ผ่าน/);
  await expect(level(page, 2)).toBeDisabled();
  await expect(page.locator('.lesson')).toContainText('สร้าง NOT');
  await expect(page.locator('.palette').getByRole('button')).toHaveCount(1);

  // ทดสอบวงจรเปล่า: ไม่ผ่าน และตารางบอกแถวที่ผิด
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ยังไม่ผ่าน');
  await expect(page.locator('.truth-table tr.fail')).toHaveCount(2);

  await buildNot(page);
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
  await expect(page.locator('.test-result')).toContainText('น้อยที่สุดที่ทำได้แล้ว');
  await expect(level(page, 1)).toHaveAttribute('aria-label', /ผ่านแล้ว/);
  await expect(level(page, 2)).toBeEnabled();

  await page.getByRole('button', { name: 'ด่านถัดไป →' }).click();
  await expect(page.locator('.lesson')).toContainText('สร้าง AND');
  await expect(page.locator('.palette').getByRole('button', { name: /^NOT/ })).toBeVisible();

  // AND = NAND แล้วกลับค่าด้วย NOT ที่สร้างเอง
  await place(page, /^NAND/, 0.4, 0.5);
  await place(page, /^NOT/, 0.6, 0.5);
  await wire(page, ['self', 'a'], ['nand1', 'a']);
  await wire(page, ['self', 'b'], ['nand1', 'b']);
  await wire(page, ['nand1', 'y'], ['not1', 'a']);
  await wire(page, ['not1', 'y'], ['self', 'y']);
  await expect(page.getByTestId('nand-count')).toHaveText('2');
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');

  // รีโหลดแล้วทุกอย่างยังอยู่
  await page.reload();
  await expect(level(page, 1)).toHaveAttribute('aria-label', /ผ่านแล้ว/);
  await expect(level(page, 2)).toHaveAttribute('aria-label', /ผ่านแล้ว/);
  await level(page, 1).click();
  await expect(page.getByTestId('wire-count')).toHaveText('3');
});

test('แก้วงจรที่ผ่านแล้ว → ต้องทดสอบใหม่ ทั้งด่านนั้น', async ({ page }) => {
  await buildNot(page);
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(level(page, 1)).toHaveAttribute('aria-label', /ผ่านแล้ว/);
  await page.keyboard.press('Control+z'); // เอาสายเส้นสุดท้ายออก
  await expect(level(page, 1)).toHaveAttribute('aria-label', /ต้องทดสอบใหม่/);
  await expect(page.locator('.test-result')).toContainText('วงจรเปลี่ยนแล้ว');
  await page.keyboard.press('Control+y');
  await expect(level(page, 1)).toHaveAttribute('aria-label', /ผ่านแล้ว/);
});

test('คำใบ้เปิดทีละข้อ', async ({ page }) => {
  const btn = page.getByRole('button', { name: /ขอคำใบ้/ });
  await btn.click();
  await expect(page.locator('.hint-text')).toHaveCount(1);
  await btn.click();
  await expect(page.locator('.hint-text')).toHaveCount(2);
  await expect(btn).toHaveCount(0);
});

test('บันทึกเป็นไฟล์ เริ่มใหม่ แล้วเปิดไฟล์กลับมา', async ({ page }) => {
  await buildNot(page);
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(level(page, 2)).toBeEnabled();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /บันทึกเป็นไฟล์/ }).click();
  const file = await (await download).path();
  const text = readFileSync(file, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ format: 'zncpu', schemaVersion: 1 });

  await page.getByRole('button', { name: 'เริ่มใหม่' }).click();
  await expect(level(page, 2)).toBeDisabled();
  await expect(page.getByTestId('wire-count')).toHaveText('0');

  // ไฟล์เสียเปิดไม่ได้ และไม่ทำให้ข้อมูลเดิมหาย
  await page.getByTestId('open-file').setInputFiles({ name: 'bad.zncpu', mimeType: 'application/json', buffer: Buffer.from('{"format":"x"}') });
  await expect(page.locator('.notice')).toContainText('เปิดไฟล์ไม่ได้');

  await page.getByTestId('open-file').setInputFiles({ name: 'save.zncpu', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('.notice')).toContainText('เปิดไฟล์แล้ว');
  await expect(level(page, 2)).toBeEnabled();
});

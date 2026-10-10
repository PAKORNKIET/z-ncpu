// ภาพหน้าจอสำหรับ README (ไม่ใช่เทสต์ปกติ): SCREENSHOTS=1 pnpm exec playwright test e2e/screenshots.spec.ts --project=build
// บันทึกไว้ที่ docs/screenshots/
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { ComponentLibrary, contentHash } from '@z-ncpu/engine';
import type { ComponentDef } from '@z-ncpu/shared';
import { before, ORDER, solution } from './helpers';

/** เปิดแอปเหมือนผู้เล่นที่ผ่านด่านเหล่านี้มาแล้วจริง (hash ถูกต้อง รายการด่านจึงขึ้นว่าผ่าน ไม่ใช่ต้องทดสอบใหม่) */
async function openWithSave(page: Page, passed: string[], drafts: string[] = []): Promise<void> {
  const components = [...passed.filter((id) => !id.startsWith('prog.')), ...drafts].map((id) => solution(id) as ComponentDef);
  const lib = new ComponentLibrary(components);
  const progress = Object.fromEntries(
    // เฉลยของแต่ละด่านคือ def เป้าหมายของด่านนั้น (ด่านเขียนโปรแกรมใช้ CPU)
    passed.map((id) => [id, { attempts: 1, passedHash: contentHash(lib, id.startsWith('prog.') ? 'user.cpu' : (solution(id) as ComponentDef).id) }]),
  );
  const save = { format: 'zncpu', schemaVersion: 1, project: { id: 'local', name: 'screenshots' }, components, progress };
  await page.addInitScript((text) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    localStorage.setItem('zncpu.save.v1', text);
    sessionStorage.setItem('e2e-seeded', '1');
  }, JSON.stringify(save));
  await page.goto('/?test');
  await expect(page.locator('canvas[role="application"], .program-editor').first()).toBeVisible();
}

/** ปิดข้อความแจ้งเตือนที่มุมจอ (เช่น "พร้อมใช้แบบออฟไลน์แล้ว") ไม่ให้บังภาพ */
async function closeToasts(page: Page): Promise<void> {
  for (const b of await page.locator('.toast').getByRole('button', { name: 'ปิดข้อความ' }).all()) await b.click();
}

test.skip(!process.env.SCREENSHOTS, 'สร้างภาพเฉพาะเมื่อสั่ง SCREENSHOTS=1');
test.skip(({ browserName }) => browserName !== 'chromium');

const OUT = join(import.meta.dirname, '..', 'docs', 'screenshots');
const shot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('zncpu.theme', 'dark'));
});

test.describe('จอคอม', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('ด่าน Full Adder', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1040 });
    await openWithSave(page, before('arith.full-adder'), ['arith.full-adder']);
    await page.locator('.level-item').filter({ hasText: /Full Adder/ }).click();
    await page.getByRole('button', { name: /^สวิตช์ a / }).click();
    await page.getByRole('button', { name: /^สวิตช์ b / }).click();
    await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
    await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
    await page.getByRole('button', { name: 'ดูทั้งวงจร' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await closeToasts(page);
    await shot(page, 'level');
  });

  test('คอมพิวเตอร์: นับ 0–9 บน CPU ที่ต่อเอง', async ({ page }) => {
    test.setTimeout(90_000);
    await openWithSave(page, ORDER);
    await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
    await expect(page.getByTestId('cpu-gates')).toHaveText('55,189', { timeout: 30_000 });
    await page.getByRole('combobox', { name: 'ความเร็ว' }).selectOption({ label: 'เร็วที่สุด' });
    await page.getByRole('button', { name: 'รัน', exact: true }).click();
    await expect(page.getByTestId('run-state')).toContainText('หยุดที่ HALT', { timeout: 20_000 });
    await closeToasts(page);
    await shot(page, 'computer');
  });

  test('มุมมอง 3D', async ({ page }) => {
    test.setTimeout(90_000);
    await openWithSave(page, ORDER);
    await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
    await expect(page.getByTestId('cpu-gates')).toHaveText('55,189', { timeout: 30_000 });
    await page.getByRole('button', { name: 'เปิดมุมมอง 3D' }).click();
    await expect(page.locator('.view3d-label').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('list', { name: 'ชิ้นส่วนข้างใน' }).getByRole('button', { name: /^ALU/ }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'ทีละคำสั่ง' }).click();
    await expect(page.getByTestId('run-state')).toContainText('cycle 3');
    await page.waitForTimeout(800);
    await closeToasts(page);
    await page.locator('.computer-3d').scrollIntoViewIfNeeded();
    await page.locator('.computer-3d').screenshot({ path: join(OUT, 'view3d.png') });
  });
});

test.describe('มือถือ', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });

  test('ด่าน NOT บนมือถือ', async ({ page }) => {
    await openWithSave(page, [], ['logic.not']);
    await page.getByRole('application').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -120));
    await closeToasts(page);
    await shot(page, 'mobile');
  });
});

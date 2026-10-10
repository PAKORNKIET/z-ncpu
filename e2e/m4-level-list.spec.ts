// M4-4: รายการด่านหาด่านถัดไปได้โดยไม่ต้องเลื่อนทั้งหน้า (บทที่ผ่านหมดแล้วพับไว้ รายการติดข้างจอ)
import { expect, test, type Page } from '@playwright/test';
import { ComponentLibrary, contentHash } from '@z-ncpu/engine';
import type { ComponentDef } from '@z-ncpu/shared';
import { before, solution, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

/** ผ่านด่านก่อน Program Counter มาแล้วจริง (บทที่ 1–5 ครบ) */
async function openAtProgramCounter(page: Page) {
  const passed = before('control.pc');
  const components = passed.map((id) => solution(id) as ComponentDef);
  const lib = new ComponentLibrary(components);
  const progress = Object.fromEntries(passed.map((id) => [id, { attempts: 1, passedHash: contentHash(lib, (solution(id) as ComponentDef).id) }]));
  await page.addInitScript((text) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    localStorage.setItem('zncpu.save.v1', text);
    sessionStorage.setItem('e2e-seeded', '1');
  }, JSON.stringify({ format: 'zncpu', schemaVersion: 1, project: { id: 'local', name: 'e2e' }, components, progress }));
  await page.goto('/?test');
  await expect(page.getByRole('application')).toBeVisible();
}

const chapter = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^บทที่ ${n} `) });

test('บทที่ผ่านหมดแล้วพับไว้ บทปัจจุบันเปิด เห็นด่านปัจจุบันและด่านถัดไปทันที', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openAtProgramCounter(page);
  for (const n of [1, 2, 3, 4, 5]) {
    await expect(chapter(page, n)).toHaveAttribute('aria-expanded', 'false');
    await expect(chapter(page, n)).toContainText('/');
  }
  await expect(chapter(page, 6)).toHaveAttribute('aria-expanded', 'true');
  const current = page.getByRole('button', { name: /^ด่าน 41 / });
  await expect(current).toBeInViewport();
  await expect(page.getByRole('button', { name: /^ด่าน 42 / })).toBeInViewport();
  await expect(page.getByRole('button', { name: /^ด่าน 1 / })).toBeHidden();

  // เปิดบทที่ผ่านแล้วกลับไปเล่นซ้ำได้
  await chapter(page, 1).click();
  await expect(chapter(page, 1)).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: /^ด่าน 1 / }).click();
  await expect(page.locator('.lesson')).toContainText('สร้าง NOT');

  // เลื่อนหน้าลงไปที่พื้นที่วาด รายการด่านยังติดอยู่ข้างจอ
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).scrollIntoViewIfNeeded();
  await expect(chapter(page, 6)).toBeInViewport();
});

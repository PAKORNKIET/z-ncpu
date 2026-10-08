// ไอคอน ธีม และการใช้บนจอขนาดต่างๆ (มือถือ แท็บเล็ต คอม)
import { expect, test } from '@playwright/test';
import { before, openWithSave, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

test('สลับธีมมืด/สว่าง และจำไว้หลังเปิดหน้าใหม่', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openWithSave(page, []);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'เปลี่ยนเป็นธีมสว่าง' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'เปลี่ยนเป็นธีมมืด' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});

test('ไม่มีอีโมจิบนหน้าจอ ใช้ไอคอนที่มีชื่อบอกความหมายแทน', async ({ page }) => {
  await openWithSave(page, before('logic.or'));
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23E9}-\u{23FA}\u{2B00}-\u{2BFF}]/u);
  // ปุ่มที่เหลือแค่ไอคอนบนจอเล็กยังมีชื่อสำหรับโปรแกรมอ่านหน้าจอ
  for (const name of ['บันทึกเป็นไฟล์', 'เปิดไฟล์', 'เริ่มใหม่', 'ซูมเข้า', 'ซูมออก', 'ดูทั้งวงจร', 'หมุน', 'ลบ']) {
    await expect(page.getByRole('button', { name, exact: true }).first()).toBeAttached();
  }
});

test.describe('มือถือ', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('รายการด่านพับเก็บ เปิดเลือกด่านได้ และหน้าไม่ล้นจอแนวนอน', async ({ page }) => {
    await openWithSave(page, before('logic.or'));
    const toggle = page.getByRole('button', { name: /ด่าน 3\/\d+: สร้าง OR/ });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'ด่าน' })).toBeHidden();
    await toggle.click();
    await page.getByRole('button', { name: /^ด่าน 1 สร้าง NOT/ }).click();
    await expect(page.getByRole('navigation', { name: 'ด่าน' })).toBeHidden();
    await expect(page.getByRole('button', { name: /ด่าน 1\/\d+: สร้าง NOT/ })).toBeVisible();
    // ชื่อปุ่มบนหัวยังอยู่ แม้ข้อความถูกซ่อน
    await expect(page.getByRole('button', { name: 'บันทึกเป็นไฟล์' })).toBeVisible();
    await expect(page.locator('.file-actions .btn-label').first()).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('ซูมด้วยปุ่มได้ และคำแนะนำเปลี่ยนเป็นแบบจอสัมผัส', async ({ page }) => {
    await openWithSave(page, before('logic.or'));
    const zoomText = page.locator('.toolbar .zoom');
    const before0 = await zoomText.textContent();
    await page.getByRole('button', { name: 'ซูมเข้า' }).click();
    await expect(zoomText).not.toHaveText(before0!);
    await expect(page.getByText(/ใช้สองนิ้วถ่าง\/บีบเพื่อซูม/)).toBeVisible();
    await expect(page.getByText(/ล้อเมาส์ซูม/)).toBeHidden();
  });
});

// ข้ามด่าน: ถามยืนยันก่อนเสมอ ใช้เฉลยเป็นชิ้นของด่าน ด่านถัดไปเล่นต่อได้ แต่ไม่นับว่าผ่าน
import { expect, test } from '@playwright/test';
import { before, level, levelNamed, openWithSave, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

/** จอแคบรายการด่านพับไว้ */
async function showLevels(page: import('@playwright/test').Page) {
  const toggle = page.locator('.levels-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

test('ข้ามด่านวงจร: ยกเลิกได้ ยืนยันแล้วไปด่านถัดไปพร้อมชิ้นจากเฉลย', async ({ page }) => {
  await openWithSave(page, []);
  await expect(page.locator('.lesson')).toContainText('สร้าง NOT');
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.getByRole('button', { name: 'ข้ามด่าน' }).click();
  expect(asked).toContain('ข้ามด่าน "สร้าง NOT"?');
  await expect(page.locator('.lesson')).toContainText('สร้าง NOT');

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'ข้ามด่าน' }).click();
  await expect(page.locator('.lesson')).toContainText('สร้าง AND');
  // ชิ้น NOT (จากเฉลย) อยู่ในกล่องชิ้นส่วนแล้ว
  await expect(page.locator('.palette').getByRole('button', { name: /^NOT/ })).toBeVisible();
  await showLevels(page);
  await expect(level(page, 1)).toHaveAttribute('aria-label', /ข้ามแล้ว \(ใช้เฉลย\)/);
  await expect(page.locator('.levels-toggle, .levels').first()).not.toContainText('ผ่าน 1');

  // กลับมาด่านที่ข้าม: ไม่มีปุ่มข้ามซ้ำ สถานะบอกว่าข้ามแล้ว และยังอยู่หลังรีโหลด
  await page.reload();
  await showLevels(page);
  await level(page, 1).click();
  await expect(page.getByTestId('level-status')).toContainText('ข้ามแล้ว');
  await expect(page.getByRole('button', { name: 'ข้ามด่าน' })).toHaveCount(0);
});

test('ข้ามด่านเขียนโปรแกรม: โปรแกรมที่เขียนไว้ไม่หาย และด่านถัดไปเปิด', async ({ page }) => {
  await openWithSave(page, before('prog.hello'));
  await levelNamed(page, /แสดงเลข 42/).click();
  const editor = page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' });
  await editor.fill('MOV A, 1\nHALT');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'ข้ามด่าน' }).click();
  await expect(page.locator('.lesson')).toContainText('นับถอยหลัง');
  await levelNamed(page, /แสดงเลข 42/).click();
  await expect(page.getByTestId('level-status')).toContainText('ข้ามแล้ว');
  await expect(editor).toHaveValue('MOV A, 1\nHALT');
});

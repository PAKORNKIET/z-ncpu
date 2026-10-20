// ดูเฉลย: คำอธิบายหลักการ + วงจรเฉลยแบบดูอย่างเดียว (ด่านเขียนโปรแกรมแสดงโปรแกรมเฉลย)
import { expect, test } from '@playwright/test';
import { before, canvas, levelNamed, openWithSave, pinAt, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

test('ด่านวงจร: ถามยืนยันก่อน แล้วเห็นคำอธิบายกับวงจรเฉลย วงจรของผู้เล่นไม่เปลี่ยน', async ({ page }) => {
  await openWithSave(page, []);
  await expect(page.getByTestId('nand-count')).toHaveText('0');
  // กดยกเลิก: ไม่เปิด
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'ดูเฉลย' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'ดูเฉลย' }).click();
  const dlg = page.getByRole('dialog', { name: 'เฉลย: สร้าง NOT' });
  await expect(dlg).toBeVisible();
  const text = dlg.getByTestId('solution-text');
  await expect(text.getByRole('heading', { name: 'หลักการ' })).toBeVisible();
  await expect(text).toContainText('ป้อนค่าเดียวกันเข้าทั้งสองขา');
  await expect(text.getByRole('heading', { name: 'ทำไมต้องแบบนี้' })).toBeVisible();
  await expect(text).toContainText('เฉลยนี้ใช้ NAND 1 ตัว');
  await expect(dlg.getByRole('application', { name: /วงจรเฉลยของด่าน สร้าง NOT/ })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('nand-count')).toHaveText('0');
  // พื้นที่วาดหลักยังใช้ได้ตามเดิม
  await expect(canvas(page)).toBeVisible();
  expect((await pinAt(page, 'self', 'a')).x).toBeGreaterThan(0);
});

test('ด่านที่ใช้ชิ้นที่สร้างเอง (ALU): วาดวงจรเฉลยได้ และปิดด้วยปุ่ม', async ({ page }) => {
  await openWithSave(page, before('alu.alu8'));
  await levelNamed(page, /ALU 8 บิต/).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'ดูเฉลย' }).click();
  const dlg = page.getByRole('dialog', { name: 'เฉลย: ALU 8 บิต' });
  await expect(dlg.getByTestId('solution-text')).toContainText('คำนวณทุกงานพร้อมกัน');
  await expect(dlg.getByRole('application')).toBeVisible();
  await dlg.getByRole('button', { name: 'ปิดเฉลย' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('ด่านเขียนโปรแกรม: เห็นโปรแกรมเฉลยกับคำอธิบาย', async ({ page }) => {
  await openWithSave(page, before('prog.max'));
  await levelNamed(page, /ค่าที่มากกว่า/).click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'ดูเฉลย' }).click();
  const dlg = page.getByRole('dialog', { name: 'เฉลย: ค่าที่มากกว่า' });
  await expect(dlg.getByTestId('solution-program')).toContainText('CMP A, B');
  await expect(dlg.getByTestId('solution-text')).toContainText('flag C');
  // โปรแกรมของผู้เล่นยังเป็นของเดิม
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' })).not.toHaveValue(/CMP A, B/);
});

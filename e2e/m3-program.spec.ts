// M3-7: บท 8 ด่านเขียนโปรแกรม รันบน CPU ที่ผู้เล่นต่อเอง
import { expect, test } from '@playwright/test';
import { before, levelNamed, openWithSave, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

test('แสดงเลข 42: โปรแกรมผิดบอกสิ่งที่จอแสดงจริง แก้แล้วผ่าน และแก้หลังผ่านต้องทดสอบใหม่', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSave(page, before('prog.hello'));
  await levelNamed(page, /แสดงเลข 42/).click();
  const editor = page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' });
  const run = page.getByRole('button', { name: 'ทดสอบบน CPU ของฉัน' });
  const cases = page.getByRole('table', { name: 'กรณีทดสอบ' });

  await editor.fill('MOV A, 41\nSTORE [OUT], A\nHALT\n');
  await run.click();
  await expect(page.locator('.test-result')).toContainText('ยังไม่ผ่าน', { timeout: 30_000 });
  await expect(cases).toContainText('จอแสดง 41');

  await editor.fill('MOV A, 42\nSTORE [OUT], A\n');
  await run.click();
  await expect(page.locator('.test-result')).toContainText('ไม่ถึง HALT', { timeout: 30_000 });

  await editor.fill('MOV A, 42\nSTORE [OUT], A\nHALT\n');
  await run.click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /ด่าน \d+ แสดงเลข 42: ผ่านแล้ว/ })).toBeVisible();

  await editor.fill('MOV A, 42\nSTORE [OUT], A\nHALT\n; ลองแก้\n');
  await expect(page.locator('.test-result')).toContainText('โปรแกรมเปลี่ยนแล้ว');
  await expect(page.getByRole('button', { name: /ด่าน \d+ แสดงเลข 42: .*ทดสอบใหม่/ })).toBeVisible({ timeout: 5_000 });
});

test('ค่าที่มากกว่า: ทดสอบหลายกรณีด้วยสวิตช์และคีย์บอร์ด', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSave(page, before('prog.max'));
  await levelNamed(page, /ค่าที่มากกว่า/).click();
  const editor = page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' });
  // ลืมกรณีที่ key มากกว่า: ผ่านบางกรณี
  await editor.fill('LOAD A, [SW]\nSTORE [OUT], A\nHALT\n');
  await page.getByRole('button', { name: 'ทดสอบบน CPU ของฉัน' }).click();
  const cases = page.getByRole('table', { name: 'กรณีทดสอบ' });
  await expect(cases.locator('tr.fail').first()).toBeVisible({ timeout: 30_000 });
  await expect(cases.locator('tr.ok')).toHaveCount(3);
  await editor.fill('LOAD A, [SW]\nLOAD B, [KEY]\nCMP A, B\nJC show\nMOV A, B\nshow: STORE [OUT], A\nHALT\n');
  await page.getByRole('button', { name: 'ทดสอบบน CPU ของฉัน' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว', { timeout: 30_000 });
  await expect(cases.locator('tr.ok')).toHaveCount(5);
});

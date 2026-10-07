// M3-4: หน้าคอมพิวเตอร์ เขียน assembly แล้วรันบน CPU ที่ต่อจาก NAND (เกณฑ์ M3: นับ 0–9 บน CPU ของผู้เล่น)
import { expect, test, type Page } from '@playwright/test';
import { openWithSave, ORDER, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

async function openComputer(page: Page) {
  await openWithSave(page, ORDER);
  await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
  await expect(page.getByTestId('cpu-gates')).toHaveText('55,189', { timeout: 30_000 });
}
const reg = (page: Page, r: string) => page.getByTestId(`reg-${r}`);
const display = (page: Page) => page.getByRole('status', { name: /^จอ \(0xF0\) = / });

test('นับ 0–9 บน CPU ของผู้เล่น: ทีละคำสั่ง แล้วรันจนถึง HALT', async ({ page }) => {
  test.setTimeout(90_000);
  await openComputer(page);
  const listing = page.getByRole('table', { name: 'คำสั่งในแผงโปรแกรม' });
  await expect(listing.locator('tbody tr')).toHaveCount(6);
  await expect(listing.locator('tr[aria-current]')).toContainText('MOV A, 0');
  await expect(reg(page, 'sp')).toHaveText('240');

  const step = page.getByRole('button', { name: '⏭ ทีละคำสั่ง' });
  await step.click();
  await step.click();
  await expect(display(page)).toHaveAttribute('aria-label', 'จอ (0xF0) = 0');
  await expect(listing.locator('tr[aria-current]')).toContainText('ADD A, 1');
  await expect(page.getByTestId('run-state')).toContainText('cycle 2');

  await page.getByRole('combobox', { name: 'ความเร็ว' }).selectOption({ label: 'เร็วที่สุด' });
  await page.getByRole('button', { name: '▶ รัน' }).click();
  await expect(page.getByTestId('run-state')).toContainText('หยุดที่ HALT', { timeout: 20_000 });
  await expect(display(page)).toHaveAttribute('aria-label', 'จอ (0xF0) = 9');
  await expect(reg(page, 'a')).toHaveText('10');
  await expect(reg(page, 'flags')).toHaveText('Z=1 C=1 N=0');
  await expect(page.getByTestId('run-state')).toContainText('cycle 41');
  await expect(page.getByRole('button', { name: '▶ รัน' })).toBeDisabled();
});

test('breakpoint: คลิกหน้าบรรทัดแล้วรันหยุดที่ CMP, เงื่อนไขที่เขียนผิดบอกคอลัมน์', async ({ page }) => {
  test.setTimeout(90_000);
  await openComputer(page);
  await page.getByRole('button', { name: 'breakpoint ที่ 0x03' }).click();
  await page.getByRole('button', { name: '▶ รัน' }).click();
  await expect(page.getByTestId('run-state')).toContainText('หยุดที่ breakpoint', { timeout: 20_000 });
  await expect(reg(page, 'pc')).toHaveText('3');
  await expect(reg(page, 'a')).toHaveText('1');

  // ลบจุดที่ CMP แล้วตั้งเงื่อนไขเอง: หยุดเมื่อ A = 7
  await page.getByRole('button', { name: 'breakpoint ที่ 0x03' }).click();
  const cond = page.getByRole('textbox', { name: 'เงื่อนไข breakpoint' });
  await cond.fill('A = 7');
  await page.getByRole('button', { name: 'เพิ่ม' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'คอลัมน์ 3' })).toContainText('ใช้ ==');
  await cond.fill('A == 7 && ZF == 0');
  await page.getByRole('button', { name: 'เพิ่ม' }).click();
  await expect(page.getByRole('list', { name: 'breakpoint ที่ตั้งไว้' })).toContainText('A == 7 && ZF == 0');
  await page.getByRole('button', { name: '▶ รัน' }).click();
  await expect(page.getByTestId('run-state')).toContainText('หยุดที่ breakpoint', { timeout: 20_000 });
  await expect(reg(page, 'a')).toHaveText('7');
  await cond.fill('FOO == 1');
  await page.getByRole('button', { name: 'เพิ่ม' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'FOO' })).toContainText('ไม่รู้จัก "FOO"');
});

test('แก้โปรแกรม: error ภาษาไทยมีบรรทัด แก้แล้วโหลดลง CPU สวิตช์ไปที่ LED', async ({ page }) => {
  test.setTimeout(90_000);
  await openComputer(page);
  const editor = page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' });
  await editor.fill('loop: LOAD A, [SW]\n  STORE [LEDS], A\n  JMP lop\n');
  await expect(page.getByRole('list', { name: 'ข้อผิดพลาดของโปรแกรม' })).toContainText('บรรทัด 3 คอลัมน์ 7: ไม่รู้จักชื่อ "lop" หมายถึง "loop" หรือเปล่า?');
  await expect(page.getByRole('button', { name: /โหลดลง CPU/ })).toBeDisabled();
  await editor.fill('loop: LOAD A, [SW]\n  STORE [LEDS], A\n  JMP loop\n');
  await page.getByRole('button', { name: /โหลดลง CPU/ }).click();
  await expect(page.getByRole('table', { name: 'คำสั่งในแผงโปรแกรม' }).locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'สวิตช์ (0xF8) บิต 0', exact: true }).click();
  await page.getByRole('button', { name: 'สวิตช์ (0xF8) บิต 7', exact: true }).click();
  await page.getByRole('button', { name: '▶ รัน' }).click();
  await expect(page.getByRole('status', { name: /^LED \(0xF1\) = / })).toHaveAttribute('aria-label', 'LED (0xF1) = 10000001', { timeout: 20_000 });
  await page.getByRole('button', { name: '⏸ หยุด' }).click();
  // โปรแกรมถูกบันทึกไว้ เปิดหน้าใหม่ยังอยู่
  await page.waitForTimeout(700);
  await page.reload();
  await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
  await expect(page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' })).toHaveValue(/JMP loop/);
});

test('ยังไม่มี CPU: บอกให้ผ่านด่านก่อน', async ({ page }) => {
  await openWithSave(page, []);
  await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
  await expect(page.getByText(/ยังไม่มี CPU ให้รันโปรแกรม/)).toBeVisible();
});

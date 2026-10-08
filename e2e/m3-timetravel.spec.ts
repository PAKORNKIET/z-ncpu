// M3-5: time travel และ Logic Analyzer บนหน้าคอมพิวเตอร์
import { expect, test, type Page } from '@playwright/test';
import { openWithSave, ORDER, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

const reg = (page: Page, r: string) => page.getByTestId(`reg-${r}`);

test('รันนับ 0–9 จนจบ แล้วย้อนดูทีละ cycle กระโดดไปต้นโปรแกรม และเห็น timing diagram', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSave(page, ORDER);
  await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
  await expect(page.getByTestId('cpu-gates')).toHaveText('55,189', { timeout: 30_000 });
  await page.getByRole('combobox', { name: 'ความเร็ว' }).selectOption({ label: 'เร็วที่สุด' });
  await page.getByRole('button', { name: 'รัน', exact: true }).click();
  await expect(page.getByTestId('run-state')).toContainText('หยุดที่ HALT', { timeout: 20_000 });
  await expect(page.getByTestId('tt-position')).toHaveText('41 / 41');

  // ค่าที่จอในแผนภาพ: 0 ถึง 9 เรียงตามเวลา
  const out = page.locator('svg.la g[data-probe="out"] text.la-value');
  await expect(out).toHaveText(['00', '01', '02', '03', '04', '05', '06', '07', '08', '09']);

  await page.getByRole('button', { name: 'ย้อน 1 cycle' }).click();
  await expect(page.getByTestId('tt-position')).toHaveText('40 / 41');
  await expect(reg(page, 'pc')).toHaveText('4');
  await expect(reg(page, 'a')).toHaveText('10');
  await expect(page.getByText(/กำลังดูอดีตที่ cycle 40/)).toBeVisible();

  await page.getByRole('button', { name: 'ไป cycle แรกที่บันทึกไว้' }).click();
  await expect(page.getByTestId('tt-position')).toHaveText('0 / 41');
  await expect(reg(page, 'pc')).toHaveText('0');
  await expect(reg(page, 'a')).toHaveText('0');

  await page.getByRole('button', { name: 'เดินหน้า 1 cycle' }).click();
  await page.getByRole('button', { name: 'เดินหน้า 1 cycle' }).click();
  await expect(page.getByTestId('tt-position')).toHaveText('2 / 41');
  await expect(page.getByRole('status', { name: /^จอ \(0xF0\) = / })).toHaveAttribute('aria-label', 'จอ (0xF0) = 0');

  await page.getByRole('button', { name: 'ปัจจุบัน' }).click();
  await expect(page.getByTestId('tt-position')).toHaveText('41 / 41');
  await expect(reg(page, 'pc')).toHaveText('5');

  // ย้อนแล้วเดินนาฬิกาจริง: เส้นเวลาใหม่เริ่มจากตรงนั้น
  await page.getByRole('slider', { name: 'cycle ที่กำลังดู' }).fill('10');
  await expect(page.getByTestId('tt-position')).toHaveText('10 / 41');
  await page.getByRole('button', { name: 'ทีละคำสั่ง' }).click();
  await expect(page.getByTestId('tt-position')).toHaveText('11 / 11');
});

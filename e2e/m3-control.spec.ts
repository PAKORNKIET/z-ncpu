// M3-2: Instruction Decoder, Register file และ Stack Pointer
import { expect, test, type Page } from '@playwright/test';
import { before, levelNamed, openWithSave, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

async function setBus(page: Page, name: string, width: number, value: number) {
  for (let i = 0; i < width; i++) {
    const btn = page.getByRole('button', { name: `${name} บิต ${i}`, exact: true });
    const want = String(((value >> i) & 1) === 1);
    if ((await btn.getAttribute('aria-pressed')) !== want) await btn.click();
  }
}

const out = (page: Page, name: string) => page.getByRole('status', { name: new RegExp(`^${name} = `) });

test('Decoder: JZ กระโดดเฉพาะเมื่อ z = 1, RET เลือก PC จาก RAM และผ่านครบ 512 กรณี', async ({ page }) => {
  await openWithSave(page, before('control.decoder'), ['control.decoder']);
  await levelNamed(page, /Instruction Decoder/).click();
  await setBus(page, 'group', 2, 2);
  await setBus(page, 'func', 3, 1);
  await expect(out(page, 'pc_sel')).toHaveAttribute('aria-label', /^pc_sel = 0/);
  await page.getByRole('button', { name: /^สวิตช์ z / }).click();
  await expect(out(page, 'pc_sel')).toHaveAttribute('aria-label', /^pc_sel = 1/);
  await setBus(page, 'func', 3, 6);
  await expect(out(page, 'pc_sel')).toHaveAttribute('aria-label', /^pc_sel = 2/);
  await expect(out(page, 'sp_op')).toHaveAttribute('aria-label', /^sp_op = 2/);
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
  await expect(page.getByText(/512/).first()).toBeVisible();
});

test('Register file: เขียน B แล้วอ่านออกทาง y และผ่านการทดสอบ', async ({ page }) => {
  await openWithSave(page, before('control.regfile'), ['control.regfile']);
  await levelNamed(page, /Register file/).click();
  const tick = page.getByRole('button', { name: /เดินนาฬิกา/ });
  await page.getByRole('button', { name: /^สวิตช์ reset / }).click();
  await tick.click();
  await page.getByRole('button', { name: /^สวิตช์ reset / }).click();
  await expect(out(page, 'b')).toHaveAttribute('aria-label', /^b = 0/);
  await setBus(page, 'rd', 2, 1);
  await setBus(page, 'in', 8, 42);
  await page.getByRole('button', { name: /^สวิตช์ write / }).click();
  await tick.click();
  await expect(out(page, 'b')).toHaveAttribute('aria-label', /^b = 42/);
  await setBus(page, 'rs', 2, 1);
  await expect(out(page, 'y')).toHaveAttribute('aria-label', /^y = 42/);
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
});

test('Stack Pointer: reset ได้ 0xF0, op = 1 ลดลง และผ่านการทดสอบ', async ({ page }) => {
  await openWithSave(page, before('control.sp'), ['control.sp']);
  await levelNamed(page, /Stack Pointer/).click();
  const tick = page.getByRole('button', { name: /เดินนาฬิกา/ });
  await page.getByRole('button', { name: /^สวิตช์ reset / }).click();
  await tick.click();
  await page.getByRole('button', { name: /^สวิตช์ reset / }).click();
  await expect(out(page, 'out')).toHaveAttribute('aria-label', 'out = 240');
  await setBus(page, 'op', 2, 1);
  await tick.click();
  await tick.click();
  await expect(out(page, 'out')).toHaveAttribute('aria-label', 'out = 238');
  await expect(out(page, 'down')).toHaveAttribute('aria-label', /^down = 237/);
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
});

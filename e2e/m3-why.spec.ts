// M3-6: Why? บนวงจร (ไล่ว่าค่ามาจากไหน) และคำอธิบายคำสั่งระดับ CPU
import { expect, test } from '@playwright/test';
import { before, levelNamed, openWithSave, ORDER, pinAt, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

test('Why? ใน CPU: ALU ได้ 1 เพราะ a = 0, b = 1, op = ADD แล้วถามต่อว่า b มาจาก MUX', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSave(page, before('cpu.z8'), ['cpu.z8']);
  await levelNamed(page, /ประกอบ CPU Z8/).click();
  await expect(page.getByTestId('nand-count')).toHaveText('55189', { timeout: 30_000 });
  await page.getByRole('button', { name: 'reset CPU' }).click();
  const tick = page.getByRole('button', { name: /เดินนาฬิกา/ });
  await tick.click();
  await tick.click();
  await expect(page.getByRole('status', { name: /^pc = / })).toHaveAttribute('aria-label', /^pc = 2 /);

  await page.getByRole('button', { name: 'Why?', exact: true }).click();
  await page.getByRole('application').scrollIntoViewIfNeeded();
  const y = await pinAt(page, 'alu81', 'y');
  await page.mouse.click(y.x, y.y);
  const panel = page.getByRole('region', { name: 'Why?' });
  await expect(panel.getByTestId('why-target')).toHaveText('alu81.y = 1');
  await expect(panel).toContainText('alu81.a = 0');
  await expect(panel).toContainText('alu81.b = 1');
  await expect(panel).toContainText('alu81.op = 0');
  await panel.getByRole('button', { name: 'Why? alu81.b' }).click();
  await expect(panel.getByTestId('why-target')).toHaveText('alu81.b = 1');
  await expect(panel).toContainText('mux81.sel = 1');
  // ค่าในตัวเก็บ flag มาจากสิ่งที่จำไว้
  await panel.getByRole('button', { name: 'ปิด Why?' }).click();
  await page.getByRole('application').scrollIntoViewIfNeeded();
  const q = await pinAt(page, 'bit1', 'out');
  await page.mouse.click(q.x, q.y);
  await expect(panel).toContainText('จำไว้');
  await panel.getByRole('button', { name: /ดูข้างใน bit1/ }).click();
  await expect(page.getByRole('button', { name: 'ออกจาก X-Ray' })).toBeVisible();
});

test('หน้าคอมพิวเตอร์อธิบายคำสั่งถัดไปด้วยค่า register จริง', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSave(page, ORDER);
  await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
  await expect(page.getByTestId('cpu-gates')).toHaveText('55,189', { timeout: 30_000 });
  await expect(page.getByTestId('explain')).toContainText('MOV A, 0x00: A ← 0');
  const step = page.getByRole('button', { name: 'ทีละคำสั่ง' });
  await step.click();
  await step.click();
  await expect(page.getByTestId('explain')).toContainText('ADD A, 0x01: A ← 0 + 1 = 1 (Z=0 C=0 N=0)');
  await step.click();
  await step.click();
  await expect(page.getByTestId('explain')).toContainText('JNZ 0x01: Z = 0 จึงกระโดดไป 0x01');
});

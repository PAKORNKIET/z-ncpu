// M2-5: ROM + แผงค่าคงที่, Program Counter, จอ 7 ส่วน และการพิมพ์ความกว้างบัส
import { expect, test, type Page } from '@playwright/test';
import { before, levelNamed, openWithSave, pinAt, watchErrors } from './helpers';

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

test('ROM8: แผงค่าคงที่ตัวอย่างต่อให้เอง เปลี่ยน addr แล้ว out ตรงกับแผง และผ่านการทดสอบ', async ({ page }) => {
  await openWithSave(page, before('mem.rom8'), ['mem.rom8']);
  await levelNamed(page, /ROM8/).click();
  const panel = page.getByRole('region', { name: 'แผงค่าคงที่' });
  await expect(panel.locator('tbody tr')).toHaveCount(8);
  // ขา data (128 บิต) ไม่มีปุ่มให้กด
  await expect(page.getByRole('button', { name: 'data บิต 0', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('reference-info')).toContainText('ข้อมูลสุ่ม 2 ชุด');

  for (const a of [5, 2, 7]) {
    await setBus(page, 'addr', 3, a);
    const hex = (await panel.locator('tbody tr').nth(a).locator('td').nth(1).textContent())!;
    const word = parseInt(hex.replace('0x', ''), 16);
    await expect(page.getByRole('status', { name: /^out = / })).toHaveAttribute('aria-label', new RegExp(`^out = ${word} `));
    await expect(panel.locator('tbody tr[aria-current]')).toHaveText(new RegExp(`^${a}`));
  }
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
  await expect(page.getByText(/ทดสอบ 16 แบบ/)).toBeVisible();
});

test('ROM256 (~16,000 NAND) ผ่านการทดสอบ และ X-Ray เข้าไปดู ROM64 ข้างในได้', async ({ page }) => {
  await openWithSave(page, before('mem.rom256'), ['mem.rom256']);
  await levelNamed(page, /ROM256/).click();
  await expect(page.getByTestId('nand-count')).toHaveText('16320', { timeout: 15_000 });
  await setBus(page, 'addr', 8, 200);
  await expect(page.getByRole('region', { name: 'แผงค่าคงที่' })).toContainText('ช่อง 200 =');
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว', { timeout: 20_000 });

  await page.getByRole('application').scrollIntoViewIfNeeded();
  const a = await pinAt(page, 'rom641', 'addr');
  const b = await pinAt(page, 'rom641', 'out');
  await page.mouse.dblclick((a.x + b.x) / 2, b.y);
  await expect(page.getByRole('button', { name: 'ออกจาก X-Ray' })).toBeVisible();
  // ค่าข้างในยังมาจากการจำลองวงจรห่อ (แผง → ROM ของผู้เล่น)
  await expect(page.getByRole('status', { name: /^rom641\.out = \d/ })).toBeVisible();
});

test('Program Counter: inc นับขึ้น load กระโดด และจอตัวเลขแสดงค่า', async ({ page }) => {
  await openWithSave(page, before('control.pc'), ['control.pc']);
  await levelNamed(page, /Program Counter/).click();
  const display = page.getByRole('status', { name: /^out = / });
  const tick = page.getByRole('button', { name: /เดินนาฬิกา/ });
  await page.getByRole('button', { name: /^สวิตช์ reset / }).click();
  await tick.click();
  await expect(display).toHaveAttribute('aria-label', 'out = 0');
  await page.getByRole('button', { name: /^สวิตช์ reset / }).click();
  await page.getByRole('button', { name: /^สวิตช์ inc / }).click();
  await tick.click();
  await tick.click();
  await expect(display).toHaveAttribute('aria-label', 'out = 2');
  await setBus(page, 'in', 8, 100);
  await page.getByRole('button', { name: /^สวิตช์ load / }).click();
  await tick.click();
  await expect(display).toHaveAttribute('aria-label', 'out = 100');
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
});

test('จอ 7 ส่วน: เลข 1 ติดขีด b c, เลข 8 ติดทุกขีด และผ่านการทดสอบ', async ({ page }) => {
  await openWithSave(page, before('io.seg7'), ['io.seg7']);
  await levelNamed(page, /7-segment/).click();
  const seg = page.getByRole('status', { name: /^seg = / });
  await setBus(page, 'in', 4, 1);
  await expect(seg).toHaveAttribute('aria-label', 'seg = ขีดที่ติด b c');
  await setBus(page, 'in', 4, 8);
  await expect(seg).toHaveAttribute('aria-label', 'seg = ขีดที่ติด a b c d e f g');
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
});

test('พิมพ์ความกว้างของตัวแยกบัสเองได้', async ({ page }) => {
  await openWithSave(page, before('arith.add4'), ['arith.add4']);
  await levelNamed(page, /บวกเลข 4 บิต/).click();
  const pin = await pinAt(page, 'split1', 'in');
  const b0 = await pinAt(page, 'split1', 'b0');
  await page.mouse.click((pin.x + b0.x) / 2, pin.y);
  const width = page.getByRole('region', { name: 'ตั้งค่า split1' }).getByLabel('ความกว้าง (บิต)');
  await width.fill('6');
  await width.press('Enter');
  await expect(page.getByRole('alert')).toContainText('ถอดสาย 1 เส้น');
  await expect(width).toHaveValue('6');
  // b0–b3 ยังเป็นบิตเดี่ยวเหมือนเดิม สายของมันจึงยังอยู่ ถอดแค่สายเข้า in ที่กว้างไม่เท่าเดิม
  await expect(page.getByTestId('wire-count')).toHaveText('19');
});

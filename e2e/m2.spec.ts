// M2: ด่านตรรกะเพิ่ม (NOR, XNOR, MUX, DEMUX) และการตั้งความกว้างของตัวแยก/รวมบัส
import { expect, test } from '@playwright/test';
import { before, canvas, levelNamed, openWithSave, pinAt, place, watchErrors, wire } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

test('ด่าน MUX: ต่อ 4 NAND แล้วผ่าน และเลือก a/b ตาม sel', async ({ page }) => {
  await openWithSave(page, before('logic.mux'));
  await levelNamed(page, /\(MUX\)/).click();
  await expect(page.locator('.lesson')).toContainText('sel');
  await place(page, /^NAND/, 0.35, 0.8);
  await place(page, /^NAND/, 0.5, 0.3);
  await place(page, /^NAND/, 0.5, 0.6);
  await place(page, /^NAND/, 0.7, 0.45);
  await wire(page, ['self', 'sel'], ['nand1', 'a']);
  await wire(page, ['self', 'sel'], ['nand1', 'b']);
  await wire(page, ['self', 'a'], ['nand2', 'a']);
  await wire(page, ['nand1', 'y'], ['nand2', 'b']);
  await wire(page, ['self', 'b'], ['nand3', 'a']);
  await wire(page, ['self', 'sel'], ['nand3', 'b']);
  await wire(page, ['nand2', 'y'], ['nand4', 'a']);
  await wire(page, ['nand3', 'y'], ['nand4', 'b']);
  await wire(page, ['nand4', 'y'], ['self', 'y']);
  await expect(page.getByTestId('wire-count')).toHaveText('9');

  const y = page.getByRole('status', { name: /^y = / });
  await page.getByRole('button', { name: /^สวิตช์ b / }).click(); // a=0 b=1 sel=0 → 0
  await expect(y).toHaveAttribute('aria-label', 'y = 0 LOW');
  await page.getByRole('button', { name: /^สวิตช์ sel / }).click(); // sel=1 → b = 1
  await expect(y).toHaveAttribute('aria-label', 'y = 1 HIGH');

  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
  await expect(page.locator('.test-result')).toContainText('น้อยที่สุดที่ทำได้แล้ว');
});

test('ตั้งความกว้างตัวแยกบัส: สายที่ไม่เข้ากันถูกถอดพร้อมบอกเหตุผล และย้อนกลับได้', async ({ page }) => {
  await openWithSave(page, before('arith.add4'), ['arith.add4']);
  await levelNamed(page, /บวกเลข 4 บิต/).click();
  await expect(page.getByTestId('nand-count')).toHaveText('36');
  await expect(page.getByTestId('wire-count')).toHaveText('20');

  // คลิกตัวแยกบัสตัวแรก (ตรงกลางระหว่างขา in กับ b0)
  const pin = await pinAt(page, 'split1', 'in');
  const b0 = await pinAt(page, 'split1', 'b0');
  await page.mouse.click((pin.x + b0.x) / 2, pin.y);
  const settings = page.getByRole('region', { name: 'ตั้งค่า split1' });
  await expect(settings).toBeVisible();

  // แบ่ง 4 บิตเป็น 2 ส่วน: ขา b2, b3 หายไป สาย 2 เส้นถูกถอด
  await settings.getByLabel('แบ่งเป็น').selectOption('2');
  await expect(page.getByRole('alert')).toContainText('ถอดสาย 4 เส้น');
  await expect(page.getByTestId('wire-count')).toHaveText('16');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('wire-count')).toHaveText('20');
  await expect(canvas(page)).toBeVisible();
});

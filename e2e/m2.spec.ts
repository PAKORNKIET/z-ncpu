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

  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
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

test('ลบเลข 8 บิต: a + NOT b + 1 ด้วยเมาส์ แล้ว 3 − 5 แสดงเป็น −2 และผ่านการทดสอบแบบสุ่ม', async ({ page }) => {
  await openWithSave(page, before('arith.sub8'));
  await levelNamed(page, /Subtractor/).click();
  await expect(page.getByTestId('reference-info')).toContainText('ทดสอบครบทุกกรณี 65,536 แบบ');

  await place(page, /^8-bit NOT/, 0.35, 0.65);
  await place(page, /^ค่าคงที่ 1/, 0.35, 0.85);
  await place(page, /^8-bit Adder/, 0.65, 0.45);
  await wire(page, ['self', 'a'], ['add81', 'a']);
  await wire(page, ['self', 'b'], ['not81', 'a']);
  await wire(page, ['not81', 'y'], ['add81', 'b']);
  await wire(page, ['const11', 'y'], ['add81', 'cin']);
  await wire(page, ['add81', 'sum'], ['self', 'diff']);
  await expect(page.getByTestId('wire-count')).toHaveText('5');
  await expect(page.getByTestId('nand-count')).toHaveText('80');

  // a = 3, b = 5
  await page.getByRole('button', { name: 'a บิต 0' }).click();
  await page.getByRole('button', { name: 'a บิต 1' }).click();
  await page.getByRole('button', { name: 'b บิต 0' }).click();
  await page.getByRole('button', { name: 'b บิต 2' }).click();
  await expect(page.getByRole('status', { name: /^diff = / })).toHaveAttribute('aria-label', 'diff = 254 (11111110) · มีเครื่องหมาย −2');

  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
  await expect(page.getByText(/ทดสอบ 65,536 แบบ/)).toBeVisible();
});

test('บวกเลข 8 บิต: ขาเข้า 17 บิตทดสอบแบบกรณีขอบ + สุ่ม และตัวต่อที่ผิดบอกแถวที่ผิด', async ({ page }) => {
  await openWithSave(page, before('arith.add8'));
  await levelNamed(page, /บวกเลข 8 บิต/).click();
  await expect(page.getByTestId('reference-info')).toContainText('สุ่มอีก 2,000 แบบ');
  // วงจรเปล่า → ผิดเกือบทุกแถว และแสดงแถวที่ผิดไม่เกิน 30 แถว
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ยังไม่ผ่าน');
  await expect(page.getByRole('table', { name: 'ผลการทดสอบ' }).locator('tbody tr')).toHaveCount(30);
});

test('ALU 8 บิต: ADD, SUB, CMP และ flags เปลี่ยนตาม op แบบสด แล้วผ่านการทดสอบ', async ({ page }) => {
  await openWithSave(page, before('alu.alu8'), ['alu.alu8']);
  await levelNamed(page, /ALU 8 บิต/).click();
  await expect(page.getByTestId('nand-count')).toHaveText('506');
  const y = page.getByRole('status', { name: /^y = / });
  const flag = (n: string) => page.getByRole('status', { name: new RegExp(`^${n} = `) });

  // a = 5, b = 3, op = ADD → 8
  await page.getByRole('button', { name: 'a บิต 0' }).click();
  await page.getByRole('button', { name: 'a บิต 2' }).click();
  await page.getByRole('button', { name: 'b บิต 0' }).click();
  await page.getByRole('button', { name: 'b บิต 1' }).click();
  await expect(y).toHaveAttribute('aria-label', 'y = 8 (00001000)');
  // op = 001 SUB → 2, c = 1 (5 ≥ 3)
  await page.getByRole('button', { name: 'op บิต 0' }).click();
  await expect(y).toHaveAttribute('aria-label', 'y = 2 (00000010)');
  await expect(flag('c')).toHaveAttribute('aria-label', 'c = 1 HIGH');
  // op = 111 CMP กับ b = 5 → 0, z = 1
  await page.getByRole('button', { name: 'op บิต 1' }).click();
  await page.getByRole('button', { name: 'op บิต 2' }).click();
  await page.getByRole('button', { name: 'b บิต 1' }).click();
  await page.getByRole('button', { name: 'b บิต 2' }).click();
  await expect(y).toHaveAttribute('aria-label', 'y = 0 (00000000)');
  await expect(flag('z')).toHaveAttribute('aria-label', 'z = 1 HIGH');
  await expect(flag('n')).toHaveAttribute('aria-label', 'n = 0 LOW');

  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
});

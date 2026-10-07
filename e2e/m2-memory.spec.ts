// M2-4: Register, ตัวนับ และ RAM256 (~36,000 NAND) — เกณฑ์ผ่าน M2: RAM256 รันใน Fast Mode ได้ลื่น
import { expect, test, type Page } from '@playwright/test';
import { before, levelNamed, openWithSave, pinAt, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

/** ตั้งค่าบัสขาเข้าให้เป็น value โดยกดเฉพาะบิตที่ต่างจากค่าปัจจุบัน */
async function setBus(page: Page, name: string, width: number, value: number) {
  for (let i = 0; i < width; i++) {
    const btn = page.getByRole('button', { name: `${name} บิต ${i}`, exact: true });
    const want = String(((value >> i) & 1) === 1);
    if ((await btn.getAttribute('aria-pressed')) !== want) await btn.click();
  }
}

test('ตัวนับ 8 บิต: กดเดินนาฬิกาแล้วนับขึ้น และ reset กลับ 0', async ({ page }) => {
  await openWithSave(page, before('state.counter8'), ['state.counter8']);
  await levelNamed(page, /ตัวนับ 8 บิต/).click();
  const q = page.getByRole('status', { name: /^q = / });
  const tick = page.getByRole('button', { name: /เดินนาฬิกา/ });
  await page.getByRole('button', { name: /^สวิตช์ reset / }).click();
  await tick.click();
  await expect(q).toHaveAttribute('aria-label', /^q = 0 /);
  await page.getByRole('button', { name: /^สวิตช์ reset / }).click();
  for (let i = 1; i <= 3; i++) {
    await tick.click();
    await expect(q).toHaveAttribute('aria-label', new RegExp(`^q = ${i} `));
  }
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
});

test('RAM256 (~36,000 NAND): เขียนแล้วอ่านกลับได้ทันที ทดสอบผ่าน และ X-Ray เข้าไปดูชั้นในได้', async ({ page }) => {
  await openWithSave(page, before('mem.ram256'), ['mem.ram256']);
  const t0 = Date.now();
  await levelNamed(page, /RAM256/).click();
  await expect(page.getByTestId('nand-count')).not.toHaveText('–', { timeout: 15_000 });
  const gates = Number(await page.getByTestId('nand-count').textContent());
  const loadMs = Date.now() - t0;
  expect(gates).toBeGreaterThan(30_000);

  const out = page.getByRole('status', { name: /^out = / });
  const tick = page.getByRole('button', { name: /เดินนาฬิกา/ });
  const load = page.getByRole('button', { name: /^สวิตช์ load / });

  // เขียน 77 ลงช่อง 200 และ 5 ลงช่อง 3
  await load.click();
  await setBus(page, 'addr', 8, 200);
  await setBus(page, 'in', 8, 77);
  await tick.click();
  await expect(out).toHaveAttribute('aria-label', /^out = 77 /);
  await setBus(page, 'addr', 8, 3);
  await setBus(page, 'in', 8, 5);
  await tick.click();
  await expect(out).toHaveAttribute('aria-label', /^out = 5 /);
  await load.click();

  // อ่านกลับ: วัดเวลาจากการกดปุ่มบิต addr หนึ่งครั้งจนค่าบนจอเปลี่ยน (ช่อง 3 ↔ ช่อง 200 ต่างกันหลายบิต จึงตั้ง addr ใกล้ๆ ก่อน)
  await setBus(page, 'addr', 8, 200);
  await expect(out).toHaveAttribute('aria-label', /^out = 77 /);
  await setBus(page, 'in', 8, 9);
  await load.click();
  await setBus(page, 'addr', 8, 201);
  await tick.click(); // ช่อง 201 = 9
  await load.click();
  const timings: number[] = [];
  for (const value of [77, 9, 77, 9]) {
    const btn = page.getByRole('button', { name: 'addr บิต 0', exact: true });
    const t = Date.now();
    await btn.click();
    await expect(out).toHaveAttribute('aria-label', new RegExp(`^out = ${value} `));
    timings.push(Date.now() - t);
  }
  console.log(`[ram256] ${gates} NAND · เปิดด่าน ${loadMs} ms · กดหนึ่งครั้งจนเห็นค่าใหม่ ${timings.join(', ')} ms`);
  // ลื่น = กดแล้วเห็นผลภายในราว 1 เฟรมของการโต้ตอบ (ตั้งเกณฑ์หลวมไว้ 500 ms เพราะเครื่อง CI ช้ากว่าเครื่องจริง)
  expect(Math.max(...timings)).toBeLessThan(500);

  const t1 = Date.now();
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว', { timeout: 20_000 });
  console.log(`[ram256] ทดสอบ ${Date.now() - t1} ms`);

  // X-Ray: ดับเบิลคลิกกลางชิ้น RAM64 ตัวแรก (ระหว่างขา in ด้านซ้ายกับขา out ด้านขวา) เห็นค่าข้างใน
  await page.getByRole('application').scrollIntoViewIfNeeded();
  const a = await pinAt(page, 'ram641', 'in');
  const b = await pinAt(page, 'ram641', 'out');
  await page.mouse.dblclick((a.x + b.x) / 2, b.y);
  await expect(page.getByRole('button', { name: '← ออกจาก X-Ray' })).toBeVisible();
  await expect(page.getByRole('status', { name: /^ram641\.addr = / })).toBeVisible();
});

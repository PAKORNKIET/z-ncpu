// M3-3: ด่านประกอบ CPU Z8 (~55,000 NAND) รันโปรแกรมบนวงจรของผู้เล่น
import { expect, test } from '@playwright/test';
import { before, levelNamed, openWithSave, solution, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

test('CPU: reset แล้วเดินนาฬิกา จอนับขึ้นตามโปรแกรมในแผง แล้วผ่านโปรแกรมทดสอบทั้ง 5 ตัว', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSave(page, before('cpu.z8'), ['cpu.z8']);
  await levelNamed(page, /ประกอบ CPU Z8/).click();
  await expect(page.getByTestId('nand-count')).toHaveText('55189', { timeout: 30_000 });
  const program = page.getByRole('region', { name: 'แผงโปรแกรม' });
  await expect(program.locator('tbody tr')).toHaveCount(6);
  await expect(program).toContainText('CMP A, 0x0A');

  await page.getByRole('button', { name: '⟲ reset CPU' }).click();
  await expect(page.getByRole('status', { name: /^pc = / })).toHaveAttribute('aria-label', /^pc = 0 /);
  await expect(program.locator('tbody tr[aria-current]')).toContainText('MOV A, 0x00');
  const tick = page.getByRole('button', { name: /เดินนาฬิกา/ });
  for (let i = 0; i < 6; i++) await tick.click();
  // MOV, STORE (0), ADD, CMP, JNZ, STORE (1)
  await expect(page.getByRole('status', { name: /^out = / })).toHaveAttribute('aria-label', 'out = 1');
  await expect(page.getByRole('status', { name: /^a = / })).toHaveAttribute('aria-label', /^a = 1 /);
  await expect(program.locator('tbody tr[aria-current]')).toContainText('ADD A, 0x01');

  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว', { timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'โปรแกรมทดสอบ' }).locator('li.ok')).toHaveCount(5);
});

test('CPU ที่ต่อ flag C ผิด: บอก cycle คำสั่ง และขาที่ได้ค่าผิด', async ({ page }) => {
  test.setTimeout(90_000);
  const broken = structuredClone(solution('cpu.z8')) as { body: { wires: { from: { pin: string }; to: { pin: string } }[] } };
  broken.body.wires.find((w) => w.from.pin === 'c' && w.to.pin === 'a')!.from.pin = 'z';
  await openWithSave(page, before('cpu.z8'), [broken]);
  await levelNamed(page, /ประกอบ CPU Z8/).click();
  await expect(page.getByTestId('nand-count')).toHaveText('55189', { timeout: 30_000 });
  await page.getByRole('button', { name: '▶ ทดสอบ' }).click();
  const fail = page.getByTestId('cpu-failure');
  await expect(fail).toContainText('ALU และ flags ผิดที่ cycle 3 หลังทำคำสั่ง ADD A, B', { timeout: 60_000 });
  const wrong = fail.getByRole('table', { name: 'ขาที่ได้ค่าผิด' });
  await expect(wrong.locator('tbody tr')).toHaveCount(1);
  await expect(wrong.getByRole('row', { name: /flags/ })).toContainText('2 · 0x02');
  await expect(page.locator('.test-result')).toContainText('CPU ทำงานไม่ตรงกับ emulator');
});

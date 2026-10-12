// M5-2: บท 9 ภารกิจขั้นสูง เขียนโปรแกรมที่ยากขึ้นบน CPU ที่ผู้เล่นต่อเอง
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, levelNamed, openWithSave, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

const source = (id: string): string =>
  (JSON.parse(readFileSync(join(import.meta.dirname, '..', 'packages', 'content', 'solutions', `${id}.json`), 'utf8')) as { source: string }).source;

test('บท 9 แสดงในรายการด่าน และด่านแรกเปิดได้หลังผ่านบท 8', async ({ page }) => {
  await openWithSave(page, before('adv.fib'));
  await expect(page.getByRole('button', { name: /^บทที่ 9 · ภารกิจขั้นสูง/ })).toBeVisible();
  await levelNamed(page, /ลำดับฟีโบนัชชี/).click();
  await expect(page.locator('.lesson')).toContainText('ฟีโบนัชชี');
  await expect(page.getByRole('table', { name: 'กรณีทดสอบ' })).toContainText('จอแสดง 1, 2, 3, 5, 8');
});

for (const [id, title] of [
  ['adv.fib', /ลำดับฟีโบนัชชี/],
  ['adv.sort', /bubble sort/],
] as const) {
  test(`${id}: เฉลยผ่านบน CPU ที่ต่อเองในเบราว์เซอร์`, async ({ page }) => {
    test.setTimeout(120_000);
    await openWithSave(page, before(id));
    await levelNamed(page, title).click();
    await page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' }).fill(source(id));
    await page.getByRole('button', { name: 'ทดสอบบน CPU ของฉัน' }).click();
    await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว', { timeout: 90_000 });
  });
}

// เมนูคลิกขวา (คอม) และกดค้าง (มือถือ) บนพื้นที่วาด + คัดลอก/วาง/ทำสำเนา
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { canvas, openWithSave, pinAt, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

const menu = (page: Page) => page.getByRole('menu');
const nands = (page: Page) => page.getByTestId('nand-count');

/** กลางกล่อง NAND n1 ของเฉลยด่าน NOT (เลื่อนหน้าให้เห็นพื้นที่วาดก่อน พิกัดเมาส์เป็นพิกัดบนจอ) */
async function n1Center(page: Page) {
  await canvas(page).scrollIntoViewIfNeeded();
  const a = await pinAt(page, 'n1', 'a');
  const y = await pinAt(page, 'n1', 'y');
  return { x: (a.x + y.x) / 2, y: y.y };
}

test.describe('คอม: คลิกขวา', () => {
  test('คลิกขวาที่ชิ้น: ทำสำเนา ลบ และคัดลอกแล้ววางที่ที่คลิกขวา', async ({ page }) => {
    await openWithSave(page, [], ['logic.not']);
    await expect(nands(page)).toHaveText('1');
    const c = await n1Center(page);

    await page.mouse.click(c.x, c.y, { button: 'right' });
    await expect(menu(page)).toBeVisible();
    await expect(menu(page)).toHaveAccessibleName(/^n1 \(NAND\)/);
    // ปุ่มแรกได้โฟกัส ใช้ลูกศรได้
    await expect(menu(page).getByRole('menuitem').first()).toBeFocused();
    await expect(menu(page).getByRole('menuitem', { name: /ดูข้างใน/ })).toHaveCount(0); // NAND ไม่มีข้างใน
    await menu(page).getByRole('menuitem', { name: /^ทำสำเนา/ }).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(nands(page)).toHaveText('2');
    await expect(canvas(page)).toBeFocused();

    // ชิ้นที่เพิ่งทำสำเนาถูกเลือกอยู่: ลบด้วยเมนู
    await expect(page.getByRole('button', { name: 'ย้อน: วางชิ้นที่คัดลอก' })).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(nands(page)).toHaveText('1');

    await page.mouse.click(c.x, c.y, { button: 'right' });
    await menu(page).getByRole('menuitem', { name: /^คัดลอก/ }).click();
    await page.mouse.click(c.x, c.y + 120, { button: 'right' });
    await expect(menu(page)).toHaveAccessibleName('พื้นที่ว่าง');
    await menu(page).getByRole('menuitem', { name: /^วาง/ }).click();
    await expect(nands(page)).toHaveText('2');

    await page.mouse.click(c.x, c.y, { button: 'right' });
    await menu(page).getByRole('menuitem', { name: /^ลบ/ }).click();
    await expect(nands(page)).toHaveText('1');
  });

  test('คีย์ลัด Ctrl+C / Ctrl+V / Ctrl+D และ Esc ปิดเมนู', async ({ page }) => {
    await openWithSave(page, [], ['logic.not']);
    const c = await n1Center(page);
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Control+d');
    await expect(nands(page)).toHaveText('2');
    await page.keyboard.press('Control+c');
    await page.mouse.move(c.x, c.y + 120);
    await page.keyboard.press('Control+v');
    await expect(nands(page)).toHaveText('3');

    await page.mouse.click(c.x, c.y + 160, { button: 'right' });
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(menu(page)).toHaveCount(0);
    await expect(canvas(page)).toBeFocused();
    // เปิดจากคีย์บอร์ดได้ (ปุ่มเมนู / Shift+F10)
    await canvas(page).focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    // คลิกที่อื่นก็ปิด
    await page.mouse.click(c.x, c.y + 160, { button: 'right' });
    await page.getByRole('heading', { name: 'ชิ้นส่วน' }).click();
    await expect(menu(page)).toHaveCount(0);
  });

  test('คลิกขวาที่สาย: Why? บอกว่าค่ามาจากไหน · ลากปุ่มขวาเลื่อนจอแล้วไม่เปิดเมนู', async ({ page }) => {
    await openWithSave(page, [], ['logic.not']);
    const y = await pinAt(page, 'n1', 'y');
    const out = await pinAt(page, 'self', 'y');
    await page.mouse.click((y.x + out.x) / 2, (y.y + out.y) / 2, { button: 'right' });
    await expect(menu(page)).toHaveAccessibleName('สายจาก n1.y');
    await menu(page).getByRole('menuitem', { name: /Why\?/ }).click();
    await expect(page.getByRole('region', { name: 'Why?' })).toBeVisible();

    const before = await n1Center(page);
    const from = { x: before.x, y: before.y + 120 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(from.x + 80, from.y - 20, { steps: 5 });
    await page.mouse.up({ button: 'right' });
    await expect(menu(page)).toHaveCount(0);
    // จอเลื่อนตามเมาส์จริง
    expect((await n1Center(page)).x).toBeCloseTo(before.x + 80, -1);
  });
});

test.describe('มือถือ: กดค้าง', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const touch = (cdp: CDPSession, type: 'touchStart' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) });

  test('กดค้างที่ชิ้นเปิดเมนู แตะ "ทำสำเนา" ได้ · แตะสั้นๆ ไม่เปิดเมนู', async ({ page }) => {
    await openWithSave(page, [], ['logic.not']);
    const cdp = await page.context().newCDPSession(page);
    await canvas(page).scrollIntoViewIfNeeded();
    const c = await n1Center(page);
    await touch(cdp, 'touchStart', [c]);
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(700);
    await expect(menu(page)).toHaveCount(0);

    await touch(cdp, 'touchStart', [c]);
    await expect(menu(page)).toBeVisible();
    await touch(cdp, 'touchEnd', []);
    // ปล่อยนิ้วแล้วเมนูยังอยู่ และชิ้นไม่ขยับ
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole('menuitem', { name: /^ทำสำเนา/ })).toBeVisible();
    const m = (await menu(page).getByRole('menuitem', { name: /^ทำสำเนา/ }).boundingBox())!;
    await touch(cdp, 'touchStart', [{ x: m.x + m.width / 2, y: m.y + m.height / 2 }]);
    await touch(cdp, 'touchEnd', []);
    await expect(nands(page)).toHaveText('2');
    await expect(menu(page)).toHaveCount(0);
  });
});

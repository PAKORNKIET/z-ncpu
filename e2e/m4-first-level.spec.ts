// M4-4: ผู้เล่นใหม่เล่นด่านแรกจนจบ ด้วยวิธีที่คนใช้จริง
// คอม: ลากชิ้นจากแถบด้านข้างมาวาง (drag & drop) · มือถือ: แตะชิ้นแล้วแตะที่วาง ใช้นิ้วลากต่อสาย
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { canvas, pinAt, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(async ({ page }) => {
  check = watchErrors(page);
  // ผู้เล่นใหม่: ไม่มีความคืบหน้าเลย
  await page.goto('/?test');
  await expect(canvas(page)).toBeVisible();
});
test.afterEach(() => check());

const level = (page: Page, n: number) => page.getByRole('button', { name: new RegExp(`^ด่าน ${n} `) });
const output = (page: Page) => page.getByRole('status', { name: /^y = / }).first();

/** จอแคบรายการด่านพับไว้ เปิดก่อนดูสถานะ */
async function showLevels(page: Page) {
  const toggle = page.locator('.levels-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

async function finishLevel(page: Page) {
  await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
  await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว');
  await page.getByRole('button', { name: 'ด่านถัดไป' }).click();
  await expect(page.locator('.lesson')).toContainText('สร้าง AND');
  // ความคืบหน้าอยู่หลังปิดเปิดใหม่
  await page.reload();
  await expect(canvas(page)).toBeVisible();
  await showLevels(page);
  await expect(level(page, 1)).toHaveAttribute('aria-label', /ผ่านแล้ว/);
  await expect(level(page, 2)).toBeEnabled();
}

test.describe('คอม: เมาส์', () => {
  test('ลาก NAND จากแถบด้านข้างมาวาง ต่อสายเป็น NOT ลองสวิตช์ แล้วผ่านด่าน', async ({ page }) => {
    await expect(page.locator('.lesson')).toContainText('สร้าง NOT');
    const box = (await canvas(page).boundingBox())!;
    await page
      .locator('.palette')
      .getByRole('button', { name: /^NAND/ })
      .dragTo(canvas(page), { targetPosition: { x: box.width * 0.5, y: box.height * 0.5 } });
    await expect(page.getByTestId('nand-count')).toHaveText('1');

    for (const [from, to] of [
      [['self', 'a'], ['nand1', 'a']],
      [['self', 'a'], ['nand1', 'b']],
      [['nand1', 'y'], ['self', 'y']],
    ] as [string, string][][]) {
      const p = await pinAt(page, from[0]!, from[1]!);
      const q = await pinAt(page, to[0]!, to[1]!);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(q.x, q.y, { steps: 6 });
      await page.mouse.up();
    }
    await expect(page.getByTestId('wire-count')).toHaveText('3');

    // ลองเองก่อนกดทดสอบ: a = 0 → y = 1, a = 1 → y = 0
    await expect(output(page)).toHaveAttribute('aria-label', /^y = 1/);
    await page.getByRole('button', { name: /^สวิตช์ a / }).click();
    await expect(output(page)).toHaveAttribute('aria-label', /^y = 0/);

    await finishLevel(page);
  });
});

test.describe('มือถือ: จอสัมผัส', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  type Pt = { x: number; y: number };
  const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) });
  const tap = async (cdp: CDPSession, p: Pt) => {
    await touch(cdp, 'touchStart', [p]);
    await touch(cdp, 'touchEnd', []);
  };
  const swipe = async (cdp: CDPSession, a: Pt, b: Pt) => {
    await touch(cdp, 'touchStart', [a]);
    for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [{ x: a.x + ((b.x - a.x) * i) / 8, y: a.y + ((b.y - a.y) * i) / 8 }]);
    await touch(cdp, 'touchEnd', []);
  };

  test('แตะ NAND แล้วแตะที่วาง ใช้นิ้วลากต่อสาย แตะสวิตช์ แล้วผ่านด่าน', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const nand = page.locator('.palette').getByRole('button', { name: /^NAND/ });
    await nand.scrollIntoViewIfNeeded();
    const nb = (await nand.boundingBox())!;
    await tap(cdp, { x: nb.x + nb.width / 2, y: nb.y + nb.height / 2 });

    await canvas(page).scrollIntoViewIfNeeded();
    const a = await pinAt(page, 'self', 'a');
    const y = await pinAt(page, 'self', 'y');
    // วางกลางระหว่างขาเข้ากับขาออก
    await tap(cdp, { x: (a.x + y.x) / 2, y: a.y });
    await expect(page.getByTestId('nand-count')).toHaveText('1');

    await swipe(cdp, await pinAt(page, 'self', 'a'), await pinAt(page, 'nand1', 'a'));
    await swipe(cdp, await pinAt(page, 'self', 'a'), await pinAt(page, 'nand1', 'b'));
    await swipe(cdp, await pinAt(page, 'nand1', 'y'), await pinAt(page, 'self', 'y'));
    await expect(page.getByTestId('wire-count')).toHaveText('3');

    // แตะขาเข้าบนพื้นที่วาดเพื่อสลับค่า
    await expect(output(page)).toHaveAttribute('aria-label', /^y = 1/);
    const pa = await pinAt(page, 'self', 'a');
    await tap(cdp, { x: pa.x - 20, y: pa.y });
    await expect(output(page)).toHaveAttribute('aria-label', /^y = 0/);

    await page.getByRole('button', { name: 'ทดสอบ', exact: true }).scrollIntoViewIfNeeded();
    await finishLevel(page);
  });
});

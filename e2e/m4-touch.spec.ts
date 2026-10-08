// จอสัมผัส (มือถือ/แท็บเล็ต): สองนิ้วซูมและเลื่อนได้พร้อมกัน และกดค้างไม่เลือกตัวหนังสือ
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { canvas, openWithSave, pinAt, watchErrors } from './helpers';

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

type Pt = { x: number; y: number };
const touch = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })) });

async function center(page: Page): Promise<Pt> {
  // พิกัดสัมผัสเป็นพิกัดบนจอ ต้องเลื่อนหน้าให้เห็นพื้นที่วาดก่อน
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('สองนิ้ว: ถ่างเพื่อซูมพร้อมลากเลื่อน จุดใต้นิ้วตามนิ้วไป', async ({ page }) => {
  await openWithSave(page, []);
  const cdp = await page.context().newCDPSession(page);
  const zoom = page.locator('.zoom').first();
  const before = Number((await zoom.textContent())!.replace('%', ''));
  const c = await center(page);
  const pin0 = await pinAt(page, 'self', 'y');

  // นิ้วสองนิ้วห่างกัน 80 px แล้วถ่างเป็น 160 px พร้อมเลื่อนกึ่งกลางลงล่าง 100 px
  const steps = 8;
  await touch(cdp, 'touchStart', [
    { x: c.x - 40, y: c.y },
    { x: c.x + 40, y: c.y },
  ]);
  for (let i = 1; i <= steps; i++) {
    const half = 40 + (40 * i) / steps;
    const dy = (100 * i) / steps;
    await touch(cdp, 'touchMove', [
      { x: c.x - half, y: c.y + dy },
      { x: c.x + half, y: c.y + dy },
    ]);
  }
  await touch(cdp, 'touchEnd', []);

  await expect.poll(async () => Number((await zoom.textContent())!.replace('%', ''))).toBeGreaterThan(before * 1.7);
  const pin1 = await pinAt(page, 'self', 'y');
  // ซูม 2 เท่ารอบกึ่งกลางนิ้ว แล้วเลื่อนตามนิ้วลง 100 px
  expect(pin1.x).toBeCloseTo(c.x + (pin0.x - c.x) * 2, -1);
  expect(pin1.y).toBeCloseTo(c.y + 100 + (pin0.y - c.y) * 2, -1);
});

test('จอมือถือ: เปิดด่านแล้วไม่ย่อวงจรจนตัวหนังสืออ่านไม่ออก', async ({ page }) => {
  await openWithSave(page, []);
  await expect(page.locator('.zoom').first()).toHaveText(/^(5\d|[6-9]\d|1\d\d)%$/);
});

test('กดค้างบนพื้นที่วาดวงจร: ไม่เลือกตัวหนังสือบนหน้า', async ({ page }) => {
  await openWithSave(page, []);
  const cdp = await page.context().newCDPSession(page);
  const c = await center(page);
  await touch(cdp, 'touchStart', [c]);
  await page.waitForTimeout(900);
  await touch(cdp, 'touchEnd', []);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  const styles = await canvas(page).evaluate((el) => {
    const s = getComputedStyle(el.parentElement!);
    return { select: s.userSelect || s.webkitUserSelect, touch: getComputedStyle(el).touchAction };
  });
  expect(styles).toEqual({ select: 'none', touch: 'none' });
});

test('นิ้วเดียวลากขาออก (y) ไปไว้ที่อื่นได้ และตำแหน่งยังอยู่หลังรีโหลด', async ({ page }) => {
  await openWithSave(page, []);
  const cdp = await page.context().newCDPSession(page);
  await center(page);
  const y0 = await pinAt(page, 'self', 'y');
  // จับที่กลางกล่องขาออก (ขาอยู่ขอบซ้ายของกล่อง) แล้วลากไปทางซ้ายและลง
  const from = { x: y0.x + 30, y: y0.y };
  await touch(cdp, 'touchStart', [from]);
  for (let i = 1; i <= 8; i++) await touch(cdp, 'touchMove', [{ x: from.x - 15 * i, y: from.y + 5 * i }]);
  await touch(cdp, 'touchEnd', []);
  await expect.poll(async () => (await pinAt(page, 'self', 'y')).x).toBeLessThan(y0.x - 80);
  const y1 = await pinAt(page, 'self', 'y');
  expect(y1.y).toBeGreaterThan(y0.y + 20);

  // บันทึกลงเครื่องแล้ว: เปิดหน้าใหม่ ตำแหน่งที่ย้ายยังอยู่ (เทียบกับขาเข้า a ที่ไม่ได้ย้าย)
  const a1 = await pinAt(page, 'self', 'a');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(canvas(page)).toBeVisible();
  await center(page);
  const a2 = await pinAt(page, 'self', 'a');
  const y2 = await pinAt(page, 'self', 'y');
  const zoomRatio = (y2.x - a2.x) / (y1.x - a1.x);
  expect(zoomRatio).toBeGreaterThan(0);
  expect((y2.y - a2.y) / zoomRatio).toBeCloseTo(y1.y - a1.y, -1);
});

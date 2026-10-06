// แท็บสนามทดลอง (M1-2): วาง NAND ต่อสายด้วยเมาส์ แล้วจำลองสดใน Worker — รันทั้ง dev และ build
import { expect, test, type Page } from '@playwright/test';

const IGNORED = [/fonts\.(googleapis|gstatic)\.com/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_INTERNET_DISCONNECTED/];
let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()) || re.test(m.location().url))) errors.push(m.text());
  });
  // ?test เปิดให้อ่านตำแหน่งขาบนจอ
  await page.goto('/?test');
  await page.getByRole('tab', { name: 'สนามทดลอง' }).click();
  await expect(page.getByRole('application')).toBeVisible();
});

test.afterEach(() => {
  expect(errors, 'ไม่ควรมี error ใน console').toEqual([]);
});

const canvas = (page: Page) => page.getByRole('application');
const led = (page: Page, name: string) => page.getByRole('status', { name: new RegExp(`^${name} = `) });
const switchButton = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^สวิตช์ ${name} `) });

/** ตัวช่วยที่แอปเปิดให้เมื่อ URL มี ?test (ดู CircuitCanvas.tsx) */
type TestWindow = { __zncpuTest?: { pin(inst: string, pin: string): { x: number; y: number } | undefined } };

async function pinAt(page: Page, inst: string, pin: string) {
  const p = await page.evaluate(
    ([i, n]) => (window as unknown as TestWindow).__zncpuTest?.pin(i!, n!),
    [inst, pin],
  );
  if (!p) throw new Error(`ไม่พบขา ${inst}.${pin}`);
  return p;
}

/** ลากจากขาหนึ่งไปอีกขาด้วยเมาส์จริง */
async function wire(page: Page, a: [string, string], b: [string, string]) {
  const p = await pinAt(page, ...a);
  const q = await pinAt(page, ...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await page.mouse.up();
}

/** วาง NAND จากกล่องชิ้นส่วน ที่ตำแหน่งสัดส่วน (fx, fy) ของพื้นที่วาด */
async function placeNand(page: Page, fx: number, fy: number) {
  await page.getByRole('button', { name: /^NAND/ }).click();
  const box = (await canvas(page).boundingBox())!;
  await canvas(page).click({ position: { x: box.width * fx, y: box.height * fy } });
}

test('ต่อ NAND ด้วยเมาส์ แล้วสวิตช์ขาเข้าเปลี่ยนค่าที่ขาออกจริง', async ({ page }) => {
  await placeNand(page, 0.5, 0.5);
  await expect(page.getByTestId('nand-count')).toHaveText('1');

  await wire(page, ['self', 'a'], ['nand1', 'a']);
  await wire(page, ['nand1', 'b'], ['self', 'b']); // ลากกลับทิศก็ได้
  await wire(page, ['nand1', 'y'], ['self', 'y']);
  await expect(page.getByTestId('wire-count')).toHaveText('3');

  const cases: [0 | 1, 0 | 1, string][] = [
    [0, 0, '1 HIGH'],
    [1, 0, '1 HIGH'],
    [1, 1, '0 LOW'],
    [0, 1, '1 HIGH'],
  ];
  for (const [a, b, y] of cases) {
    for (const [name, v] of [['a', a], ['b', b]] as const) {
      const sw = switchButton(page, name);
      if ((await sw.getAttribute('aria-pressed')) !== String(v === 1)) await sw.click();
      await expect(sw).toHaveAttribute('aria-pressed', String(v === 1));
    }
    await expect(led(page, 'y')).toHaveAttribute('aria-label', `y = ${y}`);
  }
});

test('ต่อขาเข้ากับขาเข้าไม่ได้ และบอกเหตุผลเป็นภาษาไทย', async ({ page }) => {
  await placeNand(page, 0.5, 0.5);
  await wire(page, ['nand1', 'a'], ['nand1', 'b']);
  await expect(page.getByRole('alert')).toContainText('ต่อขาเข้ากับขาเข้าไม่ได้');
  await expect(page.getByTestId('wire-count')).toHaveText('0');
});

test('ย้อน (undo) และทำซ้ำ (redo) ด้วยคีย์บอร์ด และลบด้วย Delete', async ({ page }) => {
  await placeNand(page, 0.4, 0.5);
  await placeNand(page, 0.6, 0.5);
  await expect(page.getByTestId('nand-count')).toHaveText('2');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('nand-count')).toHaveText('1');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('nand-count')).toHaveText('2');
  // ชิ้นที่เพิ่งวางถูกเลือกอยู่ หลัง redo ไม่มีอะไรถูกเลือก จึงคลิกเลือกก่อนลบ
  const box = (await canvas(page).boundingBox())!;
  await canvas(page).click({ position: { x: box.width * 0.6, y: box.height * 0.5 } });
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('nand-count')).toHaveText('1');
});

test('คลิกขาเข้าบนพื้นที่วาดเพื่อสลับค่า', async ({ page }) => {
  const sw = switchButton(page, 'a');
  await expect(sw).toHaveAttribute('aria-pressed', 'false');
  const pin = await pinAt(page, 'self', 'a');
  // คลิกที่ตัวกล่องขาเข้า (ซ้ายของขาเล็กน้อย) ไม่ใช่ที่จุดขา
  await page.mouse.click(pin.x - 30, pin.y);
  await expect(sw).toHaveAttribute('aria-pressed', 'true');
});

test('ซูมด้วยล้อเมาส์ได้ และหน้าเว็บไม่เลื่อนตาม', async ({ page }) => {
  const zoom = page.locator('.toolbar .zoom');
  const before = await zoom.textContent();
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect(zoom).not.toHaveText(before ?? '');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

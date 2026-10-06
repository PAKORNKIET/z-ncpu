// แท็บ "ตัวอย่าง engine" จาก M0: ทุกเทสต์รันทั้งใน dev server และตัว build (ดู playwright.config.ts)
import { expect, test, type Page } from '@playwright/test';

/** error ที่ไม่เกี่ยวกับแอป เช่นโหลดฟอนต์จาก Google ไม่ได้ในเครื่องที่ไม่มีเน็ต */
const IGNORED = [/fonts\.(googleapis|gstatic)\.com/, /ERR_TUNNEL_CONNECTION_FAILED/, /ERR_INTERNET_DISCONNECTED/];

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()) || re.test(m.location().url))) {
      errors.push(m.text());
    }
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'ตัวอย่าง engine' }).click();
});

test.afterEach(() => {
  expect(errors, 'ไม่ควรมี error ใน console').toEqual([]);
});

const switchButton = (page: Page, name: 'A' | 'B') => page.getByRole('button', { name: new RegExp(`^สวิตช์ ${name} `) });
const led = (page: Page, name: string) => page.getByRole('status', { name: new RegExp(`^${name} = `) });
const counter = (page: Page) => page.locator('output.big-number');

async function setSwitch(page: Page, name: 'A' | 'B', value: 0 | 1) {
  const button = switchButton(page, name);
  if ((await button.getAttribute('aria-pressed')) !== String(value === 1)) await button.click();
  await expect(button).toHaveAttribute('aria-pressed', String(value === 1));
}

test('NAND: กดสวิตช์ได้และผลถูกทั้ง 4 แบบ', async ({ page }) => {
  // สวิตช์ต้องกดได้หลัง engine พร้อม (บั๊กเดิม: ค้างเป็น disabled ตอน dev)
  await expect(switchButton(page, 'A')).toBeEnabled();
  const cases: [0 | 1, 0 | 1, string][] = [
    [0, 0, '1 HIGH'],
    [1, 0, '1 HIGH'],
    [1, 1, '0 LOW'],
    [0, 1, '1 HIGH'],
  ];
  for (const [a, b, y] of cases) {
    await setSwitch(page, 'A', a);
    await setSwitch(page, 'B', b);
    await expect(led(page, 'Y')).toHaveAttribute('aria-label', `Y = ${y}`);
  }
});

test('ตัวนับ: ทีละจังหวะ รัน และหยุด', async ({ page }) => {
  await expect(counter(page)).toHaveText('0');
  await expect(page.getByText(/ต่อจาก NAND 85 ตัว/)).toBeVisible();

  const step = page.getByRole('button', { name: /ทีละจังหวะ/ });
  for (const expected of ['1', '2', '3']) {
    await step.click();
    await expect(counter(page)).toHaveText(expected);
  }
  await expect(led(page, 'q0')).toHaveAttribute('aria-label', 'q0 = 1 HIGH');
  await expect(led(page, 'q1')).toHaveAttribute('aria-label', 'q1 = 1 HIGH');
  await expect(led(page, 'q2')).toHaveAttribute('aria-label', 'q2 = 0 LOW');

  await page.getByLabel('ความเร็ว').selectOption('30');
  await page.getByRole('button', { name: /รัน/ }).click();
  await expect(counter(page)).not.toHaveText('3');
  await page.getByRole('button', { name: /หยุด/ }).click();
  // รอให้ Worker ยืนยันว่าหยุดแล้ว (ปุ่มกลับเป็น "รัน") ค่าที่ส่งมาก่อนหยุดจะมาถึงก่อนคำยืนยันเสมอ
  await expect(page.getByRole('button', { name: /รัน/ })).toBeVisible();

  // หยุดแล้วค่าต้องไม่เปลี่ยนอีก
  const stopped = await counter(page).textContent();
  await page.waitForTimeout(300);
  await expect(counter(page)).toHaveText(stopped ?? '');

  await page.getByRole('button', { name: /รีเซ็ต/ }).click();
  await expect(counter(page)).toHaveText('0');
});

test('ตัวนับ: สลับเป็น Visual Mode แล้วยังนับถูก', async ({ page }) => {
  await expect(counter(page)).toHaveText('0');
  await page.getByLabel('โหมด').selectOption('visual');
  await expect(counter(page)).toHaveText('0');
  const step = page.getByRole('button', { name: /ทีละจังหวะ/ });
  for (const expected of ['1', '2', '3', '4', '5']) {
    await step.click();
    await expect(counter(page)).toHaveText(expected);
  }
});

test('ตัว build มีไฟล์ license ของซอฟต์แวร์อื่น', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'build', 'ไฟล์นี้สร้างตอน build เท่านั้น');
  const link = page.getByRole('link', { name: /license ของซอฟต์แวร์อื่น/ });
  await expect(link).toHaveAttribute('href', './third-party-licenses.txt');
  const res = await request.get('third-party-licenses.txt');
  expect(res.ok()).toBe(true);
  const text = await res.text();
  expect(text).toContain('react@');
  expect(text).toContain('MIT');
});

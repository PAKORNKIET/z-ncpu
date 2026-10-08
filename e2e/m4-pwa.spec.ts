// M4-1: PWA ติดตั้งได้ และเปิดได้แม้ไม่มีอินเทอร์เน็ต (service worker มีเฉพาะตัว build)
import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'build', 'service worker ลงทะเบียนเฉพาะตัว build');
});

test('manifest มีข้อมูลครบสำหรับติดตั้ง และไอคอนโหลดได้', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const m = (await res.json()) as { name: string; short_name: string; display: string; icons: { src: string; sizes: string; purpose?: string }[] };
  expect(m.short_name).toBe('Z-NCPU');
  expect(m.display).toBe('standalone');
  expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of m.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
});

test('ออฟไลน์: หลังเปิดครั้งแรก ปิดเน็ตแล้วยังเปิดแอป เล่นด่าน และจำลองวงจรได้', async ({ page, context }) => {
  const check = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'พร้อมใช้แบบออฟไลน์แล้ว' })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Z-NCPU' })).toBeVisible();
  // engine ใน Web Worker ก็มาจาก cache: กดสวิตช์ A แล้ว NAND ยังให้ค่า
  await page.getByRole('tab', { name: 'ตัวอย่าง engine' }).click();
  await expect(page.getByRole('status', { name: /^Y = 1/ })).toBeVisible();
  await page.getByRole('button', { name: /^สวิตช์ A / }).click();
  await page.getByRole('button', { name: /^สวิตช์ B / }).click();
  await expect(page.getByRole('status', { name: /^Y = 0/ })).toBeVisible();
  // ฟอนต์ไทยอยู่ในแอป ไม่ต้องโหลดจากเน็ต
  const fontOk = await page.evaluate(() => document.fonts.check('16px "Noto Sans Thai"', 'ก'));
  expect(fontOk).toBe(true);
  await context.setOffline(false);
  check();
});

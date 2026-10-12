// M5-1: ตัว build ทำงานได้ภายใต้ header ความปลอดภัยที่ Cloudflare Pages จะใส่ให้ (apps/web/public/_headers)
// ถ้า CSP บล็อกอะไร (script, worker, ฟอนต์, WebGL) จะมี error ใน console และเทสต์นี้ไม่ผ่าน
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openWithSave, ORDER, watchErrors } from './helpers';

/** header ของทุกไฟล์ (บล็อก /*) จาก _headers */
function siteHeaders(): Record<string, string> {
  const text = readFileSync(join(import.meta.dirname, '..', 'apps', 'web', 'public', '_headers'), 'utf8');
  const out: Record<string, string> = {};
  let inAll = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') continue;
    if (!line.startsWith(' ')) {
      inAll = line.trim() === '/*';
      continue;
    }
    if (inAll) {
      const i = line.indexOf(':');
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

test.use({ serviceWorkers: 'block' });

let check: () => void = () => undefined;
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'build', 'ตรวจกับตัว build ที่จะขึ้นเว็บเท่านั้น');
  check = watchErrors(page);
  const headers = siteHeaders();
  expect(headers['Content-Security-Policy']).toContain("script-src 'self'");
  await page.route('**/*', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), ...headers } });
  });
});
test.afterEach(() => check());

test('CSP ของเว็บจริง: ด่าน, CPU, มุมมอง 3D, สนามทดลอง และหน้าเกี่ยวกับ ทำงานได้ไม่มีอะไรถูกบล็อก', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithSave(page, ORDER);
  const csp = await page.evaluate(async () => (await fetch(location.href)).headers.get('content-security-policy'));
  expect(csp).toContain("frame-ancestors 'none'");
  await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
  await expect(page.getByTestId('cpu-gates')).toHaveText('55,189', { timeout: 30_000 });
  await page.getByRole('button', { name: 'ทีละคำสั่ง' }).click();
  await expect(page.getByTestId('run-state')).toContainText('cycle 1');
  await page.getByRole('button', { name: 'เปิดมุมมอง 3D' }).click();
  await expect(page.locator('.view3d-label').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'สนามทดลอง' }).click();
  await expect(page.getByRole('application')).toBeVisible();
  await page.getByRole('tab', { name: 'เกี่ยวกับ' }).click();
  await expect(page.getByTestId('about-version')).toBeVisible();
  // ฟอนต์ในแอปโหลดได้ (ไม่ถูก CSP บล็อก)
  expect(await page.evaluate(() => document.fonts.check('16px "Noto Sans Thai"'))).toBe(true);
});

test('CSP เปิดให้ติดต่อภายนอกได้เฉพาะ API ของ AI ติวเตอร์ และติวเตอร์ใช้งานได้ภายใต้ CSP', async ({ page }) => {
  const connect = siteHeaders()['Content-Security-Policy']!.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'))!;
  expect(connect.split(/\s+/).slice(1).sort()).toEqual(["'self'", 'https://api.anthropic.com', 'https://api.openai.com', 'https://generativelanguage.googleapis.com']);
  // แอป Windows ใช้ชุดเดียวกัน
  const tauri = readFileSync(join(import.meta.dirname, '..', 'apps', 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8');
  for (const host of ['https://api.anthropic.com', 'https://api.openai.com', 'https://generativelanguage.googleapis.com']) expect(tauri).toContain(host);

  // route ที่ลงทะเบียนทีหลังทำงานก่อน: ตอบแทน API จริง (CSP ของหน้ายังตรวจคำขอก่อนถึงตรงนี้)
  await page.route('https://api.openai.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ output_text: 'ผ่าน CSP' }) }),
  );
  await openWithSave(page, []);
  await page.locator('details.tutor summary').first().click();
  await page.getByRole('button', { name: 'ตั้งค่าและเปิดใช้' }).click();
  await page.getByRole('combobox', { name: 'ผู้ให้บริการ AI' }).selectOption({ label: 'OpenAI' });
  await page.getByLabel('คีย์ API', { exact: true }).fill('sk-test');
  await page.getByRole('button', { name: 'บันทึกและเปิดใช้' }).click();
  await page.getByRole('button', { name: 'ส่งไป api.openai.com' }).click();
  await expect(page.getByTestId('tutor-answer')).toContainText('ผ่าน CSP');
});

// M4-4: หน้า "เกี่ยวกับ" และการแยกไฟล์หน้าที่ไม่ได้เปิดตอนเริ่ม
import { expect, test } from '@playwright/test';
import { openWithSave, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

test('หน้าเกี่ยวกับ: ชื่อผู้พัฒนา ลิงก์ GitHub เวอร์ชัน จำนวนด่าน และ license', async ({ page }) => {
  await openWithSave(page, []);
  await page.getByRole('tab', { name: 'เกี่ยวกับ' }).click();
  const about = page.getByRole('article', { name: /เกี่ยวกับ Z-NCPU/ });
  await expect(about).toContainText('Pakornkiet Puanpanwong');
  await expect(about.getByRole('link', { name: /github\.com\/PAKORNKIET$/ })).toHaveAttribute('href', 'https://github.com/PAKORNKIET');
  await expect(about.getByRole('link', { name: /PAKORNKIET\/z-ncpu/ })).toHaveAttribute('href', 'https://github.com/PAKORNKIET/z-ncpu');
  await expect(page.getByTestId('about-version')).toHaveText(/เวอร์ชัน \d+\.\d+\.\d+/);
  await expect(about).toContainText('53 ด่าน');
  await expect(about).toContainText('MIT License');
  for (const link of await about.getByRole('link').all()) await expect(link).toHaveAttribute('rel', 'noreferrer');

  // หน้าอื่นที่แยกไฟล์ไว้ยังเปิดได้
  await page.getByRole('tab', { name: 'สนามทดลอง' }).click();
  await expect(page.getByRole('application')).toBeVisible();
  await page.getByRole('tab', { name: 'ตัวอย่าง engine' }).click();
  await expect(page.locator('main')).not.toContainText('กำลังโหลด…');
});

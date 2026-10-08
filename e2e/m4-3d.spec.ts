// M4-3: มุมมอง 3D ของ CPU ที่ต่อเสร็จ (ซูมเข้าไปดูชั้นต่างๆ และไฟวิ่งตอนรัน)
import { expect, test, type Page } from '@playwright/test';
import { openWithSave, ORDER, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

async function open3d(page: Page) {
  await openWithSave(page, ORDER);
  await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
  await expect(page.getByTestId('cpu-gates')).toHaveText('55,189', { timeout: 30_000 });
  await page.getByRole('button', { name: 'เปิดมุมมอง 3D' }).click();
  await expect(page.getByRole('img', { name: /ภาพ 3D ของ CPU/ })).toBeVisible({ timeout: 30_000 });
}

const stats = (page: Page) => page.getByTestId('view3d-stats');
const crumbs = (page: Page) => page.getByRole('navigation', { name: 'ตำแหน่งในลำดับชั้น' });

test('เปิดมุมมอง 3D: เห็น NAND ทุกตัวของ CPU ป้ายชื่อชิ้นใหญ่ และค่าที่เปลี่ยนเมื่อเดินนาฬิกา', async ({ page }) => {
  test.setTimeout(90_000);
  await open3d(page);
  const parts = page.getByRole('list', { name: 'ชิ้นส่วนข้างใน' });
  await expect(parts.getByRole('button').first()).toBeVisible();
  const total = Number((await stats(page).textContent())!.match(/NAND ([\d,]+)/)![1]!.replace(/,/g, ''));
  // CPU ทั้งตัวในวงจรห่อ (ไม่นับแผงโปรแกรม)
  expect(total).toBeGreaterThan(50_000);
  expect(total).toBeLessThanOrEqual(55_189);
  await expect(page.getByTestId('view3d-high')).toBeVisible();

  // WebGL วาดได้จริง: ป้ายชื่อถูกจัดวางในทุกเฟรมที่วาด
  await expect(page.locator('.view3d-label').first()).toBeVisible();

  // เดินนาฬิกาหนึ่งจังหวะ: มี NAND ที่เปลี่ยนค่า (ไฟวิ่ง)
  await page.getByRole('button', { name: 'ทีละคำสั่ง' }).click();
  await expect(page.getByTestId('run-state')).toContainText('cycle 1');
  await expect.poll(async () => Number((await page.getByTestId('view3d-changed').textContent())!.replace(/,/g, ''))).toBeGreaterThan(0);

  // เลือกชิ้นใหญ่สุดจากรายการ แล้วกลับภาพรวมจาก breadcrumb
  const first = parts.getByRole('button').first();
  const name = (await first.locator('.part-name').textContent())!;
  await first.click();
  await expect(page.getByTestId('view3d-selected')).toHaveText(name);
  await expect(crumbs(page).getByRole('button')).toHaveCount(2);
  await crumbs(page).getByRole('button').first().click();
  await expect(crumbs(page).getByRole('button')).toHaveCount(1);
});

test('คลิกบนภาพ 3D เลือกชิ้นที่ตรงกับป้ายชื่อ และปิดมุมมองได้', async ({ page }) => {
  test.setTimeout(90_000);
  await open3d(page);
  const label = page.locator('.view3d-label').first();
  await expect(label).toBeVisible();
  const text = (await label.textContent())!;
  const box = (await label.boundingBox())!;
  // ป้ายไม่รับคลิก (pointer-events: none) คลิกจึงลงไปถึงภาพ 3D ที่อยู่ใต้ป้าย
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(crumbs(page)).toContainText(text);
  await expect(crumbs(page).getByRole('button')).not.toHaveCount(1);

  await page.getByRole('button', { name: 'ปิดมุมมอง 3D' }).click();
  await expect(page.getByRole('img', { name: /ภาพ 3D ของ CPU/ })).toHaveCount(0);
  // ปิดแล้วยังรันต่อได้ตามปกติ
  await page.getByRole('button', { name: 'ทีละคำสั่ง' }).click();
  await expect(page.getByTestId('run-state')).toContainText('cycle 1');
});

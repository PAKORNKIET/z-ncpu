/* global URL, process */
// สร้างไอคอน PNG ของ PWA จาก SVG (รันเองเมื่อเปลี่ยนโลโก้: node apps/web/build/render-icons.mjs)
// ใช้ Chromium ของ Playwright วาด SVG จึงไม่ต้องติดตั้งโปรแกรมแปลงรูปเพิ่ม
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const jobs = [
  ['favicon.svg', 'icons/icon-192.png', 192],
  ['favicon.svg', 'icons/icon-512.png', 512],
  ['icons/maskable.svg', 'icons/maskable-512.png', 512],
  ['icons/maskable.svg', 'icons/apple-touch-icon.png', 180],
];
const executablePath = process.env.PW_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = readFileSync(pub + src, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: pub + out, omitBackground: true });
}
await browser.close();

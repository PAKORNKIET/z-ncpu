// E2E: เปิดเว็บจริงในเบราว์เซอร์ ทดสอบทั้งตอน dev (React StrictMode) และตัว build ที่จะ deploy
// ต้อง build ก่อนรัน: pnpm e2e (รวม build ให้แล้ว)
import { defineConfig, devices } from '@playwright/test';

const ci = !!process.env.CI;
/** ใช้ Chromium ที่ติดตั้งไว้แล้วในเครื่องแทนการดาวน์โหลด (ถ้าตั้งค่าไว้) */
const chromiumPath = process.env.PW_CHROMIUM_PATH;

const DEV_PORT = 5174; // ไม่ชนกับ pnpm dev ที่ใช้ 5173
const PREVIEW_PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [
    { name: 'dev', use: { baseURL: `http://localhost:${DEV_PORT}` } },
    { name: 'build', use: { baseURL: `http://localhost:${PREVIEW_PORT}` } },
  ],
  webServer: [
    {
      command: `pnpm --filter @z-ncpu/web exec vite --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @z-ncpu/web exec vite preview --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: !ci,
      timeout: 60_000,
    },
  ],
});

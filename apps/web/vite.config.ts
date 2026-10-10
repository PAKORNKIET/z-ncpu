import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { thirdPartyLicenses } from './build/third-party-licenses.ts';

/** เตือนถ้าไฟล์ JS ใดใหญ่เกิน 500 kB ยกเว้นไฟล์มุมมอง 3D ที่โหลดเมื่อกดเปิดเท่านั้น */
function chunkBudget(): Plugin {
  return {
    name: 'z-ncpu-chunk-budget',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const c of Object.values(bundle)) {
        if (c.type === 'chunk' && !c.name.startsWith('View3D') && c.code.length > 500 * 1024) {
          this.warn(`${c.fileName} ใหญ่ ${(c.code.length / 1024).toFixed(0)} kB เกินงบ 500 kB`);
        }
      }
    },
  };
}

// build เดียวใช้ทั้ง Cloudflare Pages และ Tauri (Spec ส่วน 3)
export default defineConfig({
  plugins: [
    react(),
    chunkBudget(),
    thirdPartyLicenses(fileURLToPath(new URL('.', import.meta.url))),
    // PWA (Spec ส่วน 3): ติดตั้งเป็นแอปได้ และ service worker เก็บไฟล์ build ทั้งหมดไว้ เปิดได้แม้ไม่มีเน็ต
    // ลงทะเบียน service worker เองใน src/pwa.ts (ไม่ลงทะเบียนใน Tauri และตอน dev)
    VitePWA({
      injectRegister: false,
      registerType: 'prompt',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'third-party-licenses.txt'],
      manifest: {
        id: './',
        name: 'Z-NCPU — สร้าง CPU จากเกต NAND',
        short_name: 'Z-NCPU',
        description: 'เกมสร้าง CPU 8 บิตจากเกต NAND ตั้งแต่ศูนย์ แล้วเขียนโปรแกรมให้มันรัน',
        lang: 'th',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        categories: ['education', 'games'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,txt,webmanifest}'],
        // bundle หลักใหญ่กว่าค่าเริ่มต้น 2 MB ของ workbox ได้ในอนาคต
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  // path แบบ relative ให้เปิดได้ทั้งบนเว็บและใน Tauri
  base: './',
  define: {
    // เวอร์ชันที่แสดงในหน้า "เกี่ยวกับ" มาจาก package.json ที่เดียว
    __APP_VERSION__: JSON.stringify((JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version),
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // ไฟล์มุมมอง 3D (three.js + React Three Fiber ~950 kB) โหลดเฉพาะตอนกดเปิดมุมมอง 3D ไม่กระทบหน้าแรก
    // R3F ดึง three.js มาทั้งชุด (extend(THREE)) จึงตัดส่วนที่ไม่ใช้ออกไม่ได้ ไฟล์อื่นยังตรวจงบ 500 kB ด้วย chunkBudget()
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        // React แยกไฟล์ไว้: อัปเดตแอปแล้วผู้เล่นไม่ต้องโหลด React ซ้ำ
        codeSplitting: { groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }] },
      },
    },
  },
  server: { port: 5173, strictPort: true },
});

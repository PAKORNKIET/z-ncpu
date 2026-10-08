import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { thirdPartyLicenses } from './build/third-party-licenses.ts';

// build เดียวใช้ทั้ง Cloudflare Pages และ Tauri (Spec ส่วน 3)
export default defineConfig({
  plugins: [
    react(),
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
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist' },
  server: { port: 5173, strictPort: true },
});

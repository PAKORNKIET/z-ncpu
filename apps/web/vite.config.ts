import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { thirdPartyLicenses } from './build/third-party-licenses.ts';

// build เดียวใช้ทั้ง Cloudflare Pages และ Tauri (Spec ส่วน 3)
export default defineConfig({
  plugins: [react(), thirdPartyLicenses(fileURLToPath(new URL('.', import.meta.url)))],
  // path แบบ relative ให้เปิดได้ทั้งบนเว็บและใน Tauri
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist' },
  server: { port: 5173, strictPort: true },
});

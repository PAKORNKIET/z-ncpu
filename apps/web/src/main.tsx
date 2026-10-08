import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, applyTheme, initialTheme } from './App';
// ฟอนต์อยู่ในแอปเอง ใช้ได้แม้ไม่มีอินเทอร์เน็ต (เดสก์ท็อป/PWA) และไม่ส่งข้อมูลการใช้งานไปที่อื่น
import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';

applyTheme(initialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

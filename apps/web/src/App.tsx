// หน้าหลัก: ด่าน · คอมพิวเตอร์ (รันโปรแกรมบน CPU ของผู้เล่น) · สนามทดลอง · ตัวอย่าง engine จาก M0
import { Cpu, Download, Info, FlaskConical, FolderOpen, GraduationCap, MonitorDown, Moon, RefreshCw, RotateCcw, Sun, WifiOff, X, Zap, type LucideIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { applyUpdate, installApp, pwaState, subscribePwa } from './pwa';
import { GamePage } from './game/GamePage';
import { emptySave, parseSave, serializeSave } from './game/save';
import { useSave } from './game/use-save';

// หน้าที่ไม่ได้เปิดตอนเริ่ม แยกไฟล์แล้วโหลดเมื่อกดแท็บ หน้าแรกจะได้โหลดเร็วขึ้น (PWA เก็บไว้ทั้งหมด ใช้ออฟไลน์ได้เหมือนเดิม)
const ComputerPage = lazy(() => import('./computer/ComputerPage').then((m) => ({ default: m.ComputerPage })));
const SandboxPage = lazy(() => import('./editor/SandboxPage').then((m) => ({ default: m.SandboxPage })));
const AboutPage = lazy(() => import('./about/AboutPage').then((m) => ({ default: m.AboutPage })));
const Demo = lazy(() => import('./demo/Demo').then((m) => ({ default: m.Demo })));

function PageLoading() {
  return (
    <p className="muted page-loading" role="status">
      กำลังโหลด…
    </p>
  );
}

type Tab = 'game' | 'computer' | 'sandbox' | 'demo' | 'about';

const TABS: [Tab, string, LucideIcon][] = [
  ['game', 'ด่าน', GraduationCap],
  ['computer', 'คอมพิวเตอร์', Cpu],
  ['sandbox', 'สนามทดลอง', FlaskConical],
  ['demo', 'ตัวอย่าง engine', Zap],
  ['about', 'เกี่ยวกับ', Info],
];

const THEME_KEY = 'zncpu.theme';
type Theme = 'dark' | 'light';

/** ธีมที่เลือกไว้ (เก็บในเบราว์เซอร์นี้) ถ้าไม่เคยเลือกใช้ตามระบบ */
export function initialTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'dark' || t === 'light') return t;
  } catch {
    // เบราว์เซอร์ไม่ให้ใช้ storage
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f7f9' : '#0f1115');
}

export function App() {
  const [tab, setTab] = useState<Tab>('game');
  const { save, setSave, warning } = useSave();
  /** เพิ่มเมื่อเปิดไฟล์หรือเริ่มใหม่ ให้หน้าด่านโหลดวงจรใหม่จาก save */
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);
  const pwa = useSyncExternalStore(subscribePwa, pwaState);
  const [offlineSeen, setOfflineSeen] = useState(false);
  // ข้อความพร้อมใช้ออฟไลน์แสดงแป๊บเดียวพอ
  useEffect(() => {
    if (!pwa.offlineReady) return;
    const t = setTimeout(() => setOfflineSeen(true), 8000);
    return () => clearTimeout(t);
  }, [pwa.offlineReady]);
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ไม่เป็นไร
    }
  };

  const exportFile = async (): Promise<void> => {
    const text = serializeSave(save);
    const name = `z-ncpu-${new Date().toISOString().slice(0, 10)}.zncpu`;
    // Chrome/Edge และแอป Windows (WebView2) มีหน้าต่างบันทึกไฟล์ของระบบ ให้เลือกที่เก็บเองได้
    const picker = (window as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: name,
          types: [{ description: 'ไฟล์ Z-NCPU', accept: { 'application/json': ['.zncpu'] } }],
        });
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
        setNotice(`บันทึกแล้ว: ${handle.name}`);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        // เบราว์เซอร์ไม่ยอม (เช่นใน iframe) ใช้วิธีดาวน์โหลดแทน
      }
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importFile = async (file: File): Promise<void> => {
    const r = parseSave(await file.text());
    if (!r.ok) {
      setNotice(`เปิดไฟล์ไม่ได้: ${r.reason}`);
      return;
    }
    if (!window.confirm('แทนที่ความคืบหน้าในเครื่องด้วยไฟล์นี้?')) return;
    setSave(() => r.save);
    setGeneration((g) => g + 1);
    setNotice(`เปิดไฟล์แล้ว: วงจร ${r.save.components.length} ชิ้น`);
  };

  return (
    <div className="page">
      <header className="header">
        <div className="header-row">
          <div className="brand">
            <img src="./favicon.svg" alt="" width={36} height={36} />
            <div>
              <h1>Z-NCPU</h1>
              <p className="subtitle">สร้าง CPU จากเกต NAND</p>
            </div>
          </div>
          <div className="file-actions">
            <button onClick={() => void exportFile()} aria-label="บันทึกเป็นไฟล์" title="บันทึกความคืบหน้าเป็นไฟล์ .zncpu">
              <Download size={16} aria-hidden />
              <span className="btn-label">บันทึกเป็นไฟล์</span>
            </button>
            <button onClick={() => fileInput.current?.click()} aria-label="เปิดไฟล์" title="เปิดไฟล์ .zncpu">
              <FolderOpen size={16} aria-hidden />
              <span className="btn-label">เปิดไฟล์</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".zncpu,application/json"
              hidden
              data-testid="open-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void importFile(f);
              }}
            />
            <button
              onClick={() => {
                if (!window.confirm('ลบความคืบหน้าและวงจรทั้งหมดในเครื่อง แล้วเริ่มใหม่?')) return;
                setSave(() => emptySave());
                setGeneration((g) => g + 1);
                setNotice('เริ่มใหม่แล้ว');
              }}
              aria-label="เริ่มใหม่"
              title="ลบความคืบหน้าแล้วเริ่มใหม่"
            >
              <RotateCcw size={16} aria-hidden />
              <span className="btn-label">เริ่มใหม่</span>
            </button>
            {pwa.canInstall ? (
              <button onClick={() => void installApp()} aria-label="ติดตั้งเป็นแอป" title="ติดตั้ง Z-NCPU เป็นแอปในเครื่องนี้">
                <MonitorDown size={16} aria-hidden />
                <span className="btn-label">ติดตั้งแอป</span>
              </button>
            ) : null}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'}
              title={theme === 'dark' ? 'ธีมสว่าง' : 'ธีมมืด'}
            >
              {theme === 'dark' ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
            </button>
          </div>
        </div>
        {warning || notice ? (
          <p className="notice" role="status">
            {warning ?? notice}
          </p>
        ) : null}
        <nav className="tabs" role="tablist" aria-label="หน้า">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              <Icon size={16} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'game' ? (
          <GamePage key={generation} save={save} setSave={setSave} generation={generation} />
        ) : tab === 'computer' ? (
          <Suspense fallback={<PageLoading />}>
            <ComputerPage key={generation} save={save} setSave={setSave} />
          </Suspense>
        ) : tab === 'sandbox' ? (
          <Suspense fallback={<PageLoading />}>
            <SandboxPage save={save} />
          </Suspense>
        ) : tab === 'demo' ? (
          <Suspense fallback={<PageLoading />}>
            <Demo />
          </Suspense>
        ) : (
          <Suspense fallback={<PageLoading />}>
            <AboutPage />
          </Suspense>
        )}
      </main>
      {pwa.updateReady ? (
        <div className="toast" role="status">
          <RefreshCw size={16} aria-hidden /> มี Z-NCPU เวอร์ชันใหม่แล้ว
          <button className="primary" onClick={applyUpdate}>
            อัปเดตเลย
          </button>
        </div>
      ) : pwa.offlineReady && !offlineSeen ? (
        <div className="toast" role="status">
          <WifiOff size={16} aria-hidden /> พร้อมใช้แบบออฟไลน์แล้ว
          <button className="linklike" aria-label="ปิดข้อความ" onClick={() => setOfflineSeen(true)}>
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : null}
      <footer className="footer">
        ทุกวงจรจำลองจากเกต NAND จริงใน Web Worker · ความคืบหน้าบันทึกในเบราว์เซอร์นี้
        <br />
        Z-NCPU · MIT License ·{' '}
        <a href="./third-party-licenses.txt" target="_blank" rel="noreferrer">
          license ของซอฟต์แวร์อื่นที่ใช้
        </a>
      </footer>
    </div>
  );
}

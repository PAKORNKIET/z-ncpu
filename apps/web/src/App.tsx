// หน้าหลัก: ด่าน · คอมพิวเตอร์ (รันโปรแกรมบน CPU ของผู้เล่น) · สนามทดลอง · ตัวอย่าง engine จาก M0
import { Cpu, Download, FlaskConical, FolderOpen, GraduationCap, Moon, RotateCcw, Sun, Zap, type LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { ComputerPage } from './computer/ComputerPage';
import { Demo } from './demo/Demo';
import { SandboxPage } from './editor/SandboxPage';
import { GamePage } from './game/GamePage';
import { emptySave, parseSave, serializeSave } from './game/save';
import { useSave } from './game/use-save';

type Tab = 'game' | 'computer' | 'sandbox' | 'demo';

const TABS: [Tab, string, LucideIcon][] = [
  ['game', 'ด่าน', GraduationCap],
  ['computer', 'คอมพิวเตอร์', Cpu],
  ['sandbox', 'สนามทดลอง', FlaskConical],
  ['demo', 'ตัวอย่าง engine', Zap],
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

  const exportFile = (): void => {
    const blob = new Blob([serializeSave(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `z-ncpu-${new Date().toISOString().slice(0, 10)}.zncpu`;
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
            <button onClick={exportFile} aria-label="บันทึกเป็นไฟล์" title="บันทึกความคืบหน้าเป็นไฟล์ .zncpu">
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
          <ComputerPage key={generation} save={save} setSave={setSave} />
        ) : tab === 'sandbox' ? (
          <SandboxPage save={save} />
        ) : (
          <Demo />
        )}
      </main>
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

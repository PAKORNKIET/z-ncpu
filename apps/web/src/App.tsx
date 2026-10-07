// หน้าหลัก: ด่าน (M1) · สนามทดลอง · ตัวอย่าง engine จาก M0
import { useRef, useState } from 'react';
import { Demo } from './demo/Demo';
import { SandboxPage } from './editor/SandboxPage';
import { GamePage } from './game/GamePage';
import { emptySave, parseSave, serializeSave } from './game/save';
import { useSave } from './game/use-save';

type Tab = 'game' | 'sandbox' | 'demo';

const TABS: [Tab, string][] = [
  ['game', 'ด่าน'],
  ['sandbox', 'สนามทดลอง'],
  ['demo', 'ตัวอย่าง engine'],
];

export function App() {
  const [tab, setTab] = useState<Tab>('game');
  const { save, setSave, warning } = useSave();
  /** เพิ่มเมื่อเปิดไฟล์หรือเริ่มใหม่ ให้หน้าด่านโหลดวงจรใหม่จาก save */
  const [generation, setGeneration] = useState(0);
  const [notice, setNotice] = useState<string | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);

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
          <div>
            <h1>Z-NCPU</h1>
            <p className="subtitle">สร้าง CPU จากเกต NAND · M3</p>
          </div>
          <div className="file-actions">
            <button onClick={exportFile}>⭳ บันทึกเป็นไฟล์</button>
            <button onClick={() => fileInput.current?.click()}>⭱ เปิดไฟล์</button>
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
            >
              เริ่มใหม่
            </button>
          </div>
        </div>
        {warning || notice ? (
          <p className="notice" role="status">
            {warning ?? notice}
          </p>
        ) : null}
        <nav className="tabs" role="tablist" aria-label="หน้า">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'game' ? (
          <GamePage key={generation} save={save} setSave={setSave} generation={generation} />
        ) : tab === 'sandbox' ? (
          <SandboxPage save={save} />
        ) : (
          <Demo />
        )}
      </main>
      <footer className="footer">
        ทุกวงจรจำลองจากเกต NAND จริงใน Web Worker · ความคืบหน้าบันทึกในเบราว์เซอร์นี้ · หน้าตาจะปรับใน M4
        <br />
        Z-NCPU · MIT License ·{' '}
        <a href="./third-party-licenses.txt" target="_blank" rel="noreferrer">
          license ของซอฟต์แวร์อื่นที่ใช้
        </a>
      </footer>
    </div>
  );
}

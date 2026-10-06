// หน้าหลัก: ต่อวงจร (M1) และตัวอย่าง engine จาก M0
import { useState } from 'react';
import { Demo } from './demo/Demo';
import { EditorPage } from './editor/EditorPage';

type Tab = 'editor' | 'demo';

export function App() {
  const [tab, setTab] = useState<Tab>('editor');
  return (
    <div className="page">
      <header className="header">
        <h1>Z-NCPU</h1>
        <p className="subtitle">สร้าง CPU จากเกต NAND · M1 ต่อวงจร</p>
        <nav className="tabs" role="tablist" aria-label="หน้า">
          <button role="tab" aria-selected={tab === 'editor'} onClick={() => setTab('editor')}>
            ต่อวงจร
          </button>
          <button role="tab" aria-selected={tab === 'demo'} onClick={() => setTab('demo')}>
            ตัวอย่าง engine
          </button>
        </nav>
      </header>
      <main>{tab === 'editor' ? <EditorPage /> : <Demo />}</main>
      <footer className="footer">
        ทุกวงจรจำลองจากเกต NAND จริงใน Web Worker · หน้าตาจะปรับใน M4
        <br />
        Z-NCPU · MIT License ·{' '}
        <a href="./third-party-licenses.txt" target="_blank" rel="noreferrer">
          license ของซอฟต์แวร์อื่นที่ใช้
        </a>
      </footer>
    </div>
  );
}

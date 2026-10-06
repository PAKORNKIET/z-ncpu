// M0: หน้าทดสอบ engine ผ่าน Worker — editor จริงมาใน M1 (โครงก่อน ตกแต่งทีหลัง)
import { referenceLibrary } from '@z-ncpu/engine/fixtures';
import type { CompileStats, Diagnostic, SignalValue, SimMode, WorkerToUi } from '@z-ncpu/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EngineClient } from './engine-client';

export function App() {
  return (
    <div className="page">
      <header className="header">
        <h1>Z-NCPU</h1>
        <p className="subtitle">สร้าง CPU จากเกต NAND · M0 โครง engine</p>
      </header>
      <main className="grid">
        <NandPanel />
        <CounterPanel />
      </main>
      <footer className="footer">
        ทุกวงจรในหน้านี้จำลองจากเกต NAND จริงใน Web Worker · หน้าตาจะปรับใน M4
        <br />
        Z-NCPU · MIT License ·{' '}
        <a href="./third-party-licenses.txt" target="_blank" rel="noreferrer">
          license ของซอฟต์แวร์อื่นที่ใช้
        </a>
      </footer>
    </div>
  );
}

/** ใช้ EngineClient หนึ่งตัวต่อ panel และรับค่า pin ล่าสุด */
function useEngine() {
  const client = useMemo(() => new EngineClient(), []);
  const [pins, setPins] = useState<Record<string, SignalValue>>({});
  const [cycle, setCycle] = useState(0);
  const [running, setRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  useEffect(() => {
    const off = client.subscribe((msg: WorkerToUi) => {
      if (msg.type === 'signals') {
        setPins(msg.pins);
        setCycle(msg.cycle);
      } else if (msg.type === 'status') {
        setRunning(msg.running);
        setCycle(msg.cycle);
      } else if (msg.type === 'diagnostics') {
        setDiagnostics(msg.diagnostics);
        setRunning(false);
      }
    });
    return () => {
      off();
      client.terminate();
    };
  }, [client]);

  return { client, pins, cycle, running, diagnostics, setDiagnostics };
}

function NandPanel() {
  const { client, pins } = useEngine();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await client.send({ type: 'load', components: [] });
      await client.send({ type: 'compile', defId: 'prim.nand', mode: 'visual' });
      client.post({ type: 'setInput', pin: 'a', value: 0 });
      client.post({ type: 'setInput', pin: 'b', value: 0 });
      setReady(true);
    })();
  }, [client]);

  const toggle = (pin: 'a' | 'b') => client.post({ type: 'setInput', pin, value: pins[pin] === 1 ? 0 : 1 });

  return (
    <section className="panel" aria-labelledby="nand-title">
      <h2 id="nand-title">ทดลองเกต NAND</h2>
      <p className="muted">กดสวิตช์ A และ B แล้วดูขาออก Y: ได้ 0 เฉพาะตอนที่ขาเข้าทั้งสองเป็น 1</p>
      <div className="row">
        <Switch label="A" value={pins.a} onClick={() => toggle('a')} disabled={!ready} />
        <Switch label="B" value={pins.b} onClick={() => toggle('b')} disabled={!ready} />
        <span className="arrow" aria-hidden>
          →
        </span>
        <Led label="Y" value={pins.y} />
      </div>
    </section>
  );
}

function CounterPanel() {
  const { client, pins, cycle, running, diagnostics, setDiagnostics } = useEngine();
  const [stats, setStats] = useState<CompileStats | null>(null);
  const [mode, setMode] = useState<SimMode>('fast');
  const [hz, setHz] = useState(4);
  const components = useRef(referenceLibrary().all());

  useEffect(() => {
    void (async () => {
      setDiagnostics([]);
      await client.send({ type: 'load', components: components.current });
      const res = await client.send({ type: 'compile', defId: 'user.counter4', mode });
      if (res.type === 'compiled') {
        setStats(res.stats);
        setDiagnostics(res.diagnostics);
      }
      client.post({ type: 'setInput', pin: 'reset', value: 1 });
      client.post({ type: 'step', count: 1 });
      client.post({ type: 'setInput', pin: 'reset', value: 0 });
    })();
  }, [client, mode, setDiagnostics]);

  const q = pins.q;
  const bits: SignalValue[] = typeof q === 'number' ? [3, 2, 1, 0].map((i) => (q >> i) & 1) : ['X', 'X', 'X', 'X'];

  return (
    <section className="panel" aria-labelledby="counter-title">
      <h2 id="counter-title">ตัวนับ 4 บิต (Counter)</h2>
      <p className="muted">
        ต่อจาก NAND {stats?.gates ?? '…'} ตัว: Register 4 ตัว + วงจรบวกหนึ่ง (Incrementer) · 1 จังหวะนาฬิกา = นับขึ้น 1
      </p>

      <div className="row">
        {bits.map((b, i) => (
          <Led key={i} label={`q${3 - i}`} value={b} />
        ))}
        <output className="big-number" aria-label="ค่าปัจจุบันเป็นเลขฐานสิบ">
          {q === undefined ? '…' : q}
        </output>
      </div>

      <div className="controls">
        {running ? (
          <button onClick={() => client.post({ type: 'pause' })}>⏸ หยุด</button>
        ) : (
          <button onClick={() => client.post({ type: 'run', hz })}>▶ รัน</button>
        )}
        <button onClick={() => client.post({ type: 'step', count: 1 })} disabled={running}>
          ⏭ ทีละจังหวะ
        </button>
        <button
          onClick={() => {
            client.post({ type: 'setInput', pin: 'reset', value: 1 });
            client.post({ type: 'step', count: 1 });
            client.post({ type: 'setInput', pin: 'reset', value: 0 });
          }}
          disabled={running}
        >
          ↺ รีเซ็ต
        </button>
        <label>
          ความเร็ว
          <select value={hz} onChange={(e) => setHz(Number(e.target.value))} disabled={running}>
            <option value={1}>1 Hz</option>
            <option value={4}>4 Hz</option>
            <option value={30}>30 Hz</option>
            <option value={300}>300 Hz</option>
          </select>
        </label>
        <label>
          โหมด
          <select value={mode} onChange={(e) => setMode(e.target.value as SimMode)} disabled={running}>
            <option value="fast">Fast Mode</option>
            <option value="visual">Visual Mode</option>
          </select>
        </label>
      </div>

      <p className="muted mono">clock cycle: {cycle}</p>
      <Diagnostics items={diagnostics} />
    </section>
  );
}

function Switch(props: { label: string; value: SignalValue | undefined; onClick: () => void; disabled?: boolean }) {
  const on = props.value === 1;
  return (
    <button
      className={`switch ${on ? 'on' : 'off'}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={on}
      aria-label={`สวิตช์ ${props.label} = ${valueText(props.value)}`}
    >
      <span className="switch-label">{props.label}</span>
      <span className="switch-value">{valueText(props.value)}</span>
    </button>
  );
}

function Led(props: { label: string; value: SignalValue | undefined }) {
  const v = props.value;
  const cls = v === 1 ? 'high' : v === 0 ? 'low' : 'unknown';
  return (
    <div className={`led ${cls}`} role="status" aria-label={`${props.label} = ${valueText(v)}`}>
      <span className="led-dot" />
      <span className="led-label">{props.label}</span>
      <span className="led-value">{valueText(v)}</span>
    </div>
  );
}

function Diagnostics({ items }: { items: Diagnostic[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="diagnostics">
      {items.map((d, i) => (
        <li key={i} className={d.severity}>
          {d.severity === 'error' ? '⚠ ' : 'ℹ '}
          {d.message.th}
        </li>
      ))}
    </ul>
  );
}

/** ไม่บอกค่าด้วยสีอย่างเดียว (Spec ส่วน 16) */
function valueText(v: SignalValue | undefined): string {
  if (v === 1) return '1 HIGH';
  if (v === 0) return '0 LOW';
  return 'X';
}

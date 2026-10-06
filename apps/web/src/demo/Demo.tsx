// M0: ตัวอย่าง engine ผ่าน Worker (เกต NAND และตัวนับ 4 บิตที่ต่อจาก NAND 85 ตัว)
import { referenceLibrary } from '@z-ncpu/engine/fixtures';
import type { CompileStats, SignalValue, SimMode } from '@z-ncpu/shared';
import { useRef, useState } from 'react';
import { Diagnostics, Led, Switch } from '../ui/widgets';
import { useEngine, useEngineSetup } from '../use-engine';

export function Demo() {
  return (
    <div className="grid demo">
      <NandPanel />
      <CounterPanel />
    </div>
  );
}

function NandPanel() {
  const { client, pins } = useEngine();
  const [ready, setReady] = useState(false);

  useEngineSetup(
    client,
    async (engine, isActive) => {
      setReady(false);
      await engine.send({ type: 'load', components: [] });
      await engine.send({ type: 'compile', defId: 'prim.nand', mode: 'visual' });
      engine.post({ type: 'setInput', pin: 'a', value: 0 });
      engine.post({ type: 'setInput', pin: 'b', value: 0 });
      if (isActive()) setReady(true);
    },
    [],
  );

  const toggle = (pin: 'a' | 'b') => client?.post({ type: 'setInput', pin, value: pins[pin] === 1 ? 0 : 1 });

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

  useEngineSetup(
    client,
    async (engine, isActive) => {
      setDiagnostics([]);
      await engine.send({ type: 'load', components: components.current });
      const res = await engine.send({ type: 'compile', defId: 'user.counter4', mode });
      if (!isActive()) return;
      if (res.type === 'compiled') {
        setStats(res.stats);
        setDiagnostics(res.diagnostics);
      }
      engine.post({ type: 'setInput', pin: 'reset', value: 1 });
      engine.post({ type: 'step', count: 1 });
      engine.post({ type: 'setInput', pin: 'reset', value: 0 });
    },
    [mode],
  );

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
          <button onClick={() => client?.post({ type: 'pause' })}>⏸ หยุด</button>
        ) : (
          <button onClick={() => client?.post({ type: 'run', hz })}>▶ รัน</button>
        )}
        <button onClick={() => client?.post({ type: 'step', count: 1 })} disabled={running}>
          ⏭ ทีละจังหวะ
        </button>
        <button
          onClick={() => {
            client?.post({ type: 'setInput', pin: 'reset', value: 1 });
            client?.post({ type: 'step', count: 1 });
            client?.post({ type: 'setInput', pin: 'reset', value: 0 });
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


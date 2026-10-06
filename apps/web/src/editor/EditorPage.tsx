// หน้าต่อวงจร (M1-2): กล่องชิ้นส่วน + พื้นที่วาด + แผงขาเข้า/ขาออก จำลองสดใน Worker ทุกครั้งที่แก้วงจร
// ด่านและการตรวจคำตอบมาใน M1-3 ตอนนี้เป็นสนามทดลองที่มีขาเข้า a, b และขาออก y
import { countByDef } from '@z-ncpu/canvas';
import type { ComponentDef, Diagnostic, SignalValue } from '@z-ncpu/shared';
import { useEffect, useMemo, useState } from 'react';
import { EngineClosedError } from '../engine-client';
import { useEngine } from '../use-engine';
import { Diagnostics, Led, Switch } from '../ui/widgets';
import { CircuitCanvas, DND_TYPE } from './CircuitCanvas';
import { useEditorModel } from './model';

const sandbox = (): ComponentDef => ({
  id: 'user.sandbox',
  name: { th: 'สนามทดลอง', en: 'Sandbox' },
  kind: 'circuit',
  pins: [
    { name: 'a', dir: 'in', width: 1 },
    { name: 'b', dir: 'in', width: 1 },
    { name: 'y', dir: 'out', width: 1 },
  ],
  body: { instances: [], wires: [] },
});

const PALETTE = [
  { defId: 'prim.nand', title: 'NAND', desc: 'ได้ 0 เฉพาะตอนขาเข้าเป็น 1 ทั้งคู่' },
  { defId: 'prim.const0', title: 'ค่าคงที่ 0', desc: 'ส่ง 0 ออกตลอดเวลา' },
  { defId: 'prim.const1', title: 'ค่าคงที่ 1', desc: 'ส่ง 1 ออกตลอดเวลา' },
];

/** โครงของวงจร (ไม่รวมตำแหน่ง) ถ้าเหมือนเดิมไม่ต้อง compile ใหม่ เช่นตอนลากย้ายชิ้น */
function structureKey(def: ComponentDef): string {
  const b = def.body ?? { instances: [], wires: [] };
  return JSON.stringify([
    def.pins,
    b.instances.map((i) => [i.id, i.defId, i.params ?? null]),
    b.wires.map((w) => [w.from.inst, w.from.pin, w.to.inst, w.to.pin]),
  ]);
}

export function EditorPage() {
  const model = useEditorModel(sandbox);
  const { editor, ui } = model;
  const def = editor.def;
  const { client, scope } = useEngine();
  const [inputs, setInputs] = useState<Record<string, 0 | 1>>(() =>
    Object.fromEntries(def.pins.filter((p) => p.dir === 'in').map((p) => [p.name, 0])),
  );
  const [compiled, setCompiled] = useState<{ ok: boolean; diagnostics: Diagnostic[] }>({ ok: false, diagnostics: [] });

  // ขอค่าของทุกขาในชั้นบนสุดไว้ระบายสีสาย
  useEffect(() => {
    client?.post({ type: 'subscribe', scopePath: '' });
  }, [client]);

  // compile ใหม่เมื่อโครงวงจรเปลี่ยน แล้วใส่ค่าขาเข้าเดิมกลับ
  const key = useMemo(() => structureKey(def), [def]);
  useEffect(() => {
    if (!client) return;
    let active = true;
    const current = editor.def;
    client.post({ type: 'load', components: [current] });
    client
      .send({ type: 'compile', defId: current.id, mode: 'visual' })
      .then((res) => {
        if (active && res.type === 'compiled') setCompiled({ ok: res.stats !== null, diagnostics: res.diagnostics });
      })
      .catch((e: unknown) => {
        if (!(e instanceof EngineClosedError)) console.error(e);
      });
    for (const [pin, value] of Object.entries(inputs)) client.post({ type: 'setInput', pin, value });
    return () => {
      active = false;
    };
    // ตั้งใจไม่ใส่ inputs: ค่าขาเข้าส่งแยกตอนกดสวิตช์ ไม่ต้อง compile ใหม่
  }, [client, key]);

  const toggle = (pin: string): void => {
    const value = inputs[pin] === 1 ? 0 : 1;
    setInputs((s) => ({ ...s, [pin]: value }));
    client?.post({ type: 'setInput', pin, value });
  };
  model.onToggleInput = toggle;

  const values: Record<string, SignalValue> = compiled.ok ? scope : {};
  const nand = countByDef(def).get('prim.nand') ?? 0;
  const wires = def.body?.wires.length ?? 0;
  const selected = editor.selection.instances.length + editor.selection.wires.length;
  const errors = compiled.diagnostics.filter((d) => d.severity === 'error');
  const floating = compiled.diagnostics.filter((d) => d.code === 'floating').length;
  const h = editor.history;

  return (
    <div className="editor">
      <aside className="palette" aria-labelledby="palette-title">
        <h2 id="palette-title">ชิ้นส่วน</h2>
        <p className="muted small">คลิกแล้วคลิกบนพื้นที่ หรือลากไปวาง</p>
        {PALETTE.map((p) => (
          <button
            key={p.defId}
            className={`palette-item ${ui.placing?.defId === p.defId ? 'active' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND_TYPE, p.defId);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => (ui.placing?.defId === p.defId ? ui.cancel() : ui.beginPlace({ defId: p.defId }))}
            aria-pressed={ui.placing?.defId === p.defId}
          >
            <span className="palette-title">{p.title}</span>
            <span className="palette-desc">{p.desc}</span>
          </button>
        ))}
      </aside>

      <section className="workspace" aria-label="พื้นที่ทำงาน">
        <div className="toolbar" role="toolbar" aria-label="เครื่องมือ">
          <button onClick={() => ui.key({ key: 'z', ctrl: true })} disabled={!h.canUndo} title="Ctrl+Z">
            ↶ ย้อน{h.undoLabel ? `: ${h.undoLabel}` : ''}
          </button>
          <button onClick={() => ui.key({ key: 'y', ctrl: true })} disabled={!h.canRedo} title="Ctrl+Y">
            ↷ ทำซ้ำ
          </button>
          <span className="sep" />
          <button onClick={() => ui.key({ key: 'r' })} disabled={editor.selection.instances.length === 0} title="R">
            ⟳ หมุน
          </button>
          <button onClick={() => ui.key({ key: 'Delete' })} disabled={selected === 0} title="Delete">
            ✕ ลบ
          </button>
          <span className="sep" />
          <button
            onClick={() => {
              const c = document.querySelector('.canvas-wrap')?.getBoundingClientRect();
              if (c) model.fit(c.width, c.height);
            }}
          >
            ⤢ ดูทั้งวงจร
          </button>
          <span className="muted mono zoom">{Math.round(ui.camera.zoom * 100)}%</span>
        </div>

        <CircuitCanvas model={model} values={values} />

        <div className="status-line" role="alert" aria-live="assertive">
          {editor.lastError ? <span className="error">⚠ {editor.lastError.th}</span> : null}
        </div>
        <p className="muted small hint">
          {ui.placing
            ? 'คลิกเพื่อวาง (กด Shift ค้างไว้เพื่อวางหลายชิ้น) · Esc ยกเลิก'
            : ui.wiring
              ? 'คลิกขาปลายทางเพื่อต่อสาย · คลิกที่ว่างหรือ Esc เพื่อยกเลิก'
              : 'ลากจากขาหนึ่งไปอีกขาเพื่อต่อสาย · ลากที่ว่างเพื่อเลื่อนจอ · Shift+ลาก เลือกหลายชิ้น · ล้อเมาส์ซูม · R หมุน · Delete ลบ'}
        </p>
      </section>

      <aside className="inspector" aria-labelledby="io-title">
        <h2 id="io-title">ขาของวงจร</h2>
        <p className="muted small">กดสวิตช์ (หรือคลิกขาเข้าบนพื้นที่) แล้วดูค่าที่ขาออก</p>
        <div className="row">
          {def.pins
            .filter((p) => p.dir === 'in')
            .map((p) => (
              <Switch key={p.name} label={p.name} value={values[`self.${p.name}`] ?? inputs[p.name]} onClick={() => toggle(p.name)} />
            ))}
        </div>
        <div className="row">
          {def.pins
            .filter((p) => p.dir === 'out')
            .map((p) => (
              <Led key={p.name} label={p.name} value={values[`self.${p.name}`]} />
            ))}
        </div>
        <dl className="stats">
          <dt>NAND</dt>
          <dd data-testid="nand-count">{nand}</dd>
          <dt>สาย</dt>
          <dd data-testid="wire-count">{wires}</dd>
        </dl>
        {floating > 0 && errors.length === 0 ? (
          <p className="muted small">ยังมีขาที่ไม่ได้ต่อ {floating} จุด (ค่าเป็น X)</p>
        ) : null}
        <Diagnostics items={errors} />
      </aside>
    </div>
  );
}

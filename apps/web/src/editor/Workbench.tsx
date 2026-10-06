// พื้นที่ทำงาน: กล่องชิ้นส่วน + พื้นที่วาด + แผงขาเข้า/ขาออก จำลองสดใน Worker ทุกครั้งที่แก้วงจร
// ใช้ทั้งในด่าน (GamePage) และสนามทดลอง (SandboxPage) — ส่วนเฉพาะของแต่ละหน้าส่งมาทาง side
import { ComponentLibrary } from '@z-ncpu/engine';
import type { ComponentDef, Diagnostic, SignalValue } from '@z-ncpu/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EngineClient, EngineClosedError } from '../engine-client';
import { useEngine } from '../use-engine';
import { Diagnostics, Led, Switch } from '../ui/widgets';
import { CircuitCanvas, DND_TYPE } from './CircuitCanvas';
import { useEditorModel } from './model';

export interface PaletteItem {
  defId: string;
  title: string;
  desc: string;
}

export const PRIMITIVE_PALETTE: Record<string, PaletteItem> = {
  'prim.nand': { defId: 'prim.nand', title: 'NAND', desc: 'ได้ 0 เฉพาะตอนขาเข้าเป็น 1 ทั้งคู่' },
  'prim.const0': { defId: 'prim.const0', title: 'ค่าคงที่ 0', desc: 'ส่ง 0 ออกตลอดเวลา' },
  'prim.const1': { defId: 'prim.const1', title: 'ค่าคงที่ 1', desc: 'ส่ง 1 ออกตลอดเวลา' },
};

/** สิ่งที่หน้าที่ใช้ Workbench อ่านได้ (เช่นเอาไปทดสอบ) */
export interface WorkbenchContext {
  def: ComponentDef;
  client: EngineClient | null;
  /** จำนวน NAND ทั้งหมดหลังคลี่ทุกชั้น (null = compile ไม่ผ่าน) */
  gates: number | null;
}

/** โครงของวงจร (ไม่รวมตำแหน่ง) ถ้าเหมือนเดิมไม่ต้อง compile ใหม่ เช่นตอนลากย้ายชิ้น */
function structureKey(defs: readonly ComponentDef[]): string {
  return JSON.stringify(
    defs.map((def) => {
      const b = def.body ?? { instances: [], wires: [] };
      return [
        def.id,
        def.pins,
        b.instances.map((i) => [i.id, i.defId, i.params ?? null]),
        b.wires.map((w) => [w.from.inst, w.from.pin, w.to.inst, w.to.pin]),
      ];
    }),
  );
}

export function Workbench(props: {
  initial: ComponentDef;
  /** วงจรอื่นของผู้เล่นที่วงจรนี้อาจใช้ (ไม่รวมตัวมันเอง) */
  deps?: ComponentDef[];
  palette: PaletteItem[];
  onChange?: (def: ComponentDef) => void;
  side?: (ctx: WorkbenchContext) => ReactNode;
}) {
  const deps = props.deps ?? [];
  const model = useEditorModel(() => ({ def: props.initial, library: new ComponentLibrary(deps) }));
  const { editor, ui } = model;
  const def = editor.def;
  const { client, scope } = useEngine();
  const [inputs, setInputs] = useState<Record<string, 0 | 1>>(() =>
    Object.fromEntries(def.pins.filter((p) => p.dir === 'in').map((p) => [p.name, 0])),
  );
  const [compiled, setCompiled] = useState<{ gates: number | null; diagnostics: Diagnostic[] }>({ gates: null, diagnostics: [] });

  // แจ้งหน้าแม่ทุกครั้งที่วงจรเปลี่ยน (ใช้บันทึกอัตโนมัติ)
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  useEffect(() => editor.history.subscribe(() => onChange.current?.(editor.def)), [editor]);

  // ขอค่าของทุกขาในชั้นบนสุดไว้ระบายสีสาย
  useEffect(() => {
    client?.post({ type: 'subscribe', scopePath: '' });
  }, [client]);

  // compile ใหม่เมื่อโครงวงจรเปลี่ยน แล้วใส่ค่าขาเข้าเดิมกลับ
  const otherDeps = deps.filter((d) => d.id !== def.id);
  const key = useMemo(() => structureKey([...otherDeps, def]), [def, otherDeps]);
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  useEffect(() => {
    if (!client) return;
    let active = true;
    const current = editor.def;
    client.post({ type: 'load', components: [...otherDeps, current] });
    client
      .send({ type: 'compile', defId: current.id, mode: 'visual' })
      .then((res) => {
        if (active && res.type === 'compiled') setCompiled({ gates: res.stats?.gates ?? null, diagnostics: res.diagnostics });
      })
      .catch((e: unknown) => {
        if (!(e instanceof EngineClosedError)) console.error(e);
      });
    for (const [pin, value] of Object.entries(inputsRef.current)) client.post({ type: 'setInput', pin, value });
    return () => {
      active = false;
    };
    // key รวมทุกอย่างที่ต้อง compile ใหม่แล้ว
  }, [client, key]);

  // คีย์ลัดใช้ได้ทุกที่ในหน้า (เช่นหลังกดปุ่มทดสอบแล้วกด Ctrl+Z) ยกเว้นตอนพิมพ์ในช่องข้อความ
  // Delete/R/Backspace ใช้ได้เฉพาะตอนโฟกัสอยู่ที่พื้นที่วาดหรือไม่ได้อยู่ที่ปุ่มใด กันการกดพลาดบนปุ่มอื่น
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const free = !t || t === document.body || t.tagName === 'CANVAS';
      if (!free && !(e.ctrlKey || e.metaKey) && e.key !== 'Escape') return;
      if (ui.key({ key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })) e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ui]);

  const toggle = (pin: string): void => {
    const value = inputs[pin] === 1 ? 0 : 1;
    setInputs((s) => ({ ...s, [pin]: value }));
    client?.post({ type: 'setInput', pin, value });
  };
  model.onToggleInput = toggle;

  const values: Record<string, SignalValue> = compiled.gates !== null ? scope : {};
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
        {props.palette.map((p) => (
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
          <dt>NAND รวม</dt>
          <dd data-testid="nand-count">{compiled.gates ?? '–'}</dd>
          <dt>สาย</dt>
          <dd data-testid="wire-count">{wires}</dd>
        </dl>
        {floating > 0 && errors.length === 0 ? (
          <p className="muted small">ยังมีขาที่ไม่ได้ต่อ {floating} จุด (ค่าเป็น X)</p>
        ) : null}
        <Diagnostics items={errors} />
        {props.side?.({ def, client, gates: compiled.gates })}
      </aside>
    </div>
  );
}

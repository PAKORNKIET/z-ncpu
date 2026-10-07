// พื้นที่ทำงาน: กล่องชิ้นส่วน + พื้นที่วาด + แผงขาเข้า/ขาออก จำลองสดใน Worker ทุกครั้งที่แก้วงจร
// ใช้ทั้งในด่าน (GamePage) และสนามทดลอง (SandboxPage) — ส่วนเฉพาะของแต่ละหน้าส่งมาทาง side
import { ComponentLibrary } from '@z-ncpu/engine';
import type { ComponentDef, Diagnostic, SignalValue } from '@z-ncpu/shared';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { EngineClient, EngineClosedError } from '../engine-client';
import { useEngine } from '../use-engine';
import { BusInput, Diagnostics, Led, Switch } from '../ui/widgets';
import { CircuitCanvas, DND_TYPE } from './CircuitCanvas';
import { EditorModel, useEditorModel } from './model';

export interface PaletteItem {
  defId: string;
  title: string;
  desc: string;
  params?: Record<string, number>;
}

export const PRIMITIVE_PALETTE: Record<string, PaletteItem> = {
  'prim.nand': { defId: 'prim.nand', title: 'NAND', desc: 'ได้ 0 เฉพาะตอนขาเข้าเป็น 1 ทั้งคู่' },
  'prim.const0': { defId: 'prim.const0', title: 'ค่าคงที่ 0', desc: 'ส่ง 0 ออกตลอดเวลา' },
  'prim.const1': { defId: 'prim.const1', title: 'ค่าคงที่ 1', desc: 'ส่ง 1 ออกตลอดเวลา' },
  // M1 ใช้บัส 4 บิตเท่านั้น ความกว้างอื่นเลือกได้ใน M2
  'prim.split': { defId: 'prim.split', title: 'แยก bus', desc: 'บัส 4 บิต → b0…b3 (b0 = บิตขวาสุด)', params: { width: 4 } },
  'prim.merge': { defId: 'prim.merge', title: 'รวม bus', desc: 'b0…b3 → บัส 4 บิต', params: { width: 4 } },
};

/** สิ่งที่หน้าที่ใช้ Workbench อ่านได้ (เช่นเอาไปทดสอบ) */
export interface WorkbenchContext {
  def: ComponentDef;
  client: EngineClient | null;
  /** จำนวน NAND ทั้งหมดหลังคลี่ทุกชั้น (null = compile ไม่ผ่าน) */
  gates: number | null;
}

/** ไล่จากวงจรบนสุดลงไปตาม path ของ X-Ray คืนเฉพาะชั้นที่ยังมีอยู่จริง (ชิ้นอาจถูกลบหรือ undo ไปแล้ว) */
function resolveXRay(top: ComponentDef, path: readonly string[], lib: ComponentLibrary): { id: string; def: ComponentDef }[] {
  const out: { id: string; def: ComponentDef }[] = [];
  let cur = top;
  for (const id of path) {
    const inst = cur.body?.instances.find((i) => i.id === id);
    const inner = inst ? lib.get(inst.defId) : undefined;
    if (!inner?.body) break;
    out.push({ id, def: inner });
    cur = inner;
  }
  return out;
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
  const { client, scope, pins } = useEngine();
  const [inputs, setInputs] = useState<Record<string, number>>(() =>
    Object.fromEntries(def.pins.filter((p) => p.dir === 'in').map((p) => [p.name, 0])),
  );
  const [compiled, setCompiled] = useState<{ gates: number | null; diagnostics: Diagnostic[] }>({ gates: null, diagnostics: [] });

  // แจ้งหน้าแม่ทุกครั้งที่วงจรเปลี่ยน (ใช้บันทึกอัตโนมัติ)
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  useEffect(() => editor.history.subscribe(() => onChange.current?.(editor.def)), [editor]);

  // ---------- X-Ray: ดูข้างในชิ้นที่สร้างเอง (อ่านอย่างเดียว ค่าในสายมาจากการจำลองวงจรบนสุดจริง) ----------
  const [xray, setXray] = useState<string[]>([]);
  const chain = resolveXRay(def, xray, model.library);
  useEffect(() => {
    if (chain.length < xray.length) setXray(chain.map((c) => c.id));
  }, [chain.length, xray.length]);
  const viewKey = chain.map((c) => c.id).join('/');
  const cache = useRef(new Map<string, EditorModel>());
  let view = model;
  const inner = chain.at(-1);
  if (inner) {
    let m = cache.current.get(viewKey);
    if (!m || m.editor.def !== inner.def) {
      m = new EditorModel(inner.def, model.library, { readOnly: true });
      cache.current.set(viewKey, m);
    }
    view = m;
  }
  useSyncExternalStore((cb) => view.listen(cb), view.snapshot);
  const openInside = (id: string): void => {
    const inst = view.editor.def.body?.instances.find((i) => i.id === id);
    if (!inst) return;
    if (model.library.get(inst.defId)?.body) {
      setXray([...chain.map((c) => c.id), id]);
    } else {
      const name = view.sceneOptions.titleOf?.(inst.defId) ?? inst.defId;
      view.editor.lastError = {
        th: `${name} เป็นเกตพื้นฐาน ไม่มีวงจรข้างในให้ดู`,
        en: `${name} is a basic gate with nothing inside`,
      };
      view.ui.setCamera(view.ui.camera);
    }
  };
  view.onOpen = openInside;
  model.onOpen = openInside;
  const inXRay = chain.length > 0;
  const exitXRay = (levels = 1): void => setXray(chain.slice(0, Math.max(0, chain.length - levels)).map((c) => c.id));

  // ขอค่าของทุกขาในชั้นที่กำลังดูไว้ระบายสีสาย
  useEffect(() => {
    client?.post({ type: 'subscribe', scopePath: viewKey });
  }, [client, viewKey]);

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
  // ตอน X-Ray: Esc ถอยออกทีละชั้น
  const keyTarget = useRef({ view, inXRay: chain.length > 0, exit: exitXRay });
  keyTarget.current = { view, inXRay: chain.length > 0, exit: exitXRay };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent): void => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const free = !t || t === document.body || t.tagName === 'CANVAS';
      if (!free && !(e.ctrlKey || e.metaKey) && e.key !== 'Escape') return;
      const k = keyTarget.current;
      if (k.view.ui.key({ key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })) e.preventDefault();
      else if (e.key === 'Escape' && k.inXRay) {
        k.exit();
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const setInput = (pin: string, value: number): void => {
    setInputs((s) => ({ ...s, [pin]: value }));
    client?.post({ type: 'setInput', pin, value });
  };
  /** คลิกขาเข้า: 1 บิตสลับ 0/1, บัสเพิ่มค่าทีละ 1 (วนกลับที่ 0) */
  const toggle = (pin: string): void => {
    const width = def.pins.find((p) => p.name === pin)?.width ?? 1;
    const cur = inputs[pin] ?? 0;
    setInput(pin, width === 1 ? (cur === 1 ? 0 : 1) : (cur + 1) % 2 ** width);
  };
  const hasClock = def.pins.some((p) => p.name === 'clk' && p.dir === 'in' && p.width === 1);
  /** หนึ่งจังหวะนาฬิกา: clk 0 → 1 → 0 (worker ทำตามลำดับ จึงได้ขอบขาขึ้นหนึ่งครั้ง) */
  const tick = (): void => {
    if (!client) return;
    if (inputs.clk !== 0) client.post({ type: 'setInput', pin: 'clk', value: 0 });
    client.post({ type: 'setInput', pin: 'clk', value: 1 });
    client.post({ type: 'setInput', pin: 'clk', value: 0 });
    setInputs((s) => ({ ...s, clk: 0 }));
  };
  model.onToggleInput = toggle;

  const values: Record<string, SignalValue> = compiled.gates !== null && scope.path === viewKey ? scope.values : {};
  const top: Record<string, SignalValue> = compiled.gates !== null ? pins : {};
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
              e.dataTransfer.setData(DND_TYPE, JSON.stringify({ defId: p.defId, ...(p.params ? { params: p.params } : {}) }));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => (ui.placing?.defId === p.defId ? ui.cancel() : ui.beginPlace({ defId: p.defId, ...(p.params ? { params: p.params } : {}) }))}
            aria-pressed={ui.placing?.defId === p.defId}
            disabled={inXRay}
          >
            <span className="palette-title">{p.title}</span>
            <span className="palette-desc">{p.desc}</span>
          </button>
        ))}
      </aside>

      <section className="workspace" aria-label="พื้นที่ทำงาน">
        {inXRay ? (
          <div className="toolbar xray-bar" role="toolbar" aria-label="X-Ray">
            <button onClick={() => exitXRay(chain.length)}>← ออกจาก X-Ray</button>
            <nav className="crumbs" aria-label="ตำแหน่งที่กำลังดู">
              <button onClick={() => exitXRay(chain.length)}>{def.name.th}</button>
              {chain.map((c, i) => (
                <span key={c.id}>
                  {' › '}
                  <button onClick={() => exitXRay(chain.length - 1 - i)} aria-current={i === chain.length - 1 ? 'location' : undefined}>
                    {c.id} ({c.def.name.th})
                  </button>
                </span>
              ))}
            </nav>
            <span className="muted mono zoom">{Math.round(view.ui.camera.zoom * 100)}%</span>
          </div>
        ) : (
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
        )}

        <CircuitCanvas
          key={viewKey}
          model={view}
          values={values}
          {...(inXRay ? { label: `X-Ray ข้างใน ${viewKey}: ดูอย่างเดียว ดับเบิลคลิกชิ้นเพื่อดูลึกลงไป Esc เพื่อออก` } : {})}
        />

        <div className="status-line" role="alert" aria-live="assertive">
          {view.editor.lastError ? <span className="error">⚠ {view.editor.lastError.th}</span> : null}
        </div>
        <p className="muted small hint">
          {inXRay
            ? '🔍 X-Ray: ดูข้างในอย่างเดียว ค่าในสายมาจากการจำลองจริง ลองกดสวิตช์ขาเข้าทางขวาแล้วดูไฟวิ่ง · ดับเบิลคลิกชิ้นข้างในเพื่อดูลึกลงไป · Esc ออกทีละชั้น'
            : ui.placing
            ? 'คลิกเพื่อวาง (กด Shift ค้างไว้เพื่อวางหลายชิ้น) · Esc ยกเลิก'
            : ui.wiring
              ? 'คลิกขาปลายทางเพื่อต่อสาย · คลิกที่ว่างหรือ Esc เพื่อยกเลิก'
              : 'ลากจากขาหนึ่งไปอีกขาเพื่อต่อสาย · ลากที่ว่างเพื่อเลื่อนจอ · Shift+ลาก เลือกหลายชิ้น · ล้อเมาส์ซูม · R หมุน · Delete ลบ · ดับเบิลคลิกชิ้นเพื่อดูข้างใน'}
        </p>
      </section>

      <aside className="inspector" aria-labelledby="io-title">
        <h2 id="io-title">ขาของวงจร</h2>
        <p className="muted small">กดสวิตช์ (หรือคลิกขาเข้าบนพื้นที่) แล้วดูค่าที่ขาออก</p>
        <div className="row">
          {def.pins
            .filter((p) => p.dir === 'in')
            .map((p) => (
              p.width > 1 ? (
                <BusInput key={p.name} label={p.name} width={p.width} value={inputs[p.name] ?? 0} onChange={(v) => setInput(p.name, v)} />
              ) : (
                <Switch key={p.name} label={p.name} value={top[p.name] ?? inputs[p.name]} onClick={() => toggle(p.name)} />
              )
            ))}
        </div>
        {hasClock ? (
          <button className="tick" onClick={tick} disabled={!client}>
            ⏱ เดินนาฬิกา 1 จังหวะ
          </button>
        ) : null}
        <div className="row">
          {def.pins
            .filter((p) => p.dir === 'out')
            .map((p) => (
              <Led key={p.name} label={p.name} value={top[p.name]} width={p.width} />
            ))}
        </div>
        {inner ? (
          <section className="xray-pins" aria-label={`ขาของ ${viewKey}`}>
            <h3>
              🔍 ขาของ {chain.at(-1)!.id} ({inner.def.name.th})
            </h3>
            <div className="row">
              {inner.def.pins.map((p) => (
                <Led key={p.name} label={`${chain.at(-1)!.id}.${p.name}`} value={values[`self.${p.name}`]} width={p.width} />
              ))}
            </div>
          </section>
        ) : null}
        {!inXRay ? <PartSettings model={model} /> : null}
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

const BUS_WIDTHS = [2, 4, 8, 16];

/** ตั้งค่าชิ้นที่เลือก: ตอนนี้มีแค่ความกว้างและจำนวนส่วนของตัวแยก/รวมบัส */
function PartSettings({ model }: { model: EditorModel }) {
  const { editor } = model;
  const ids = editor.selection.instances;
  const inst = ids.length === 1 ? editor.def.body?.instances.find((i) => i.id === ids[0]) : undefined;
  if (!inst || (inst.defId !== 'prim.split' && inst.defId !== 'prim.merge')) return null;
  const width = inst.params?.width ?? 4;
  const parts = inst.params?.parts ?? width;
  const divisors = Array.from({ length: width }, (_, i) => i + 1).filter((d) => width % d === 0 && d > 1);
  const apply = (next: Record<string, number>): void => {
    const removed = editor.setParams(inst.id, next);
    if (removed && removed > 0) {
      editor.lastError = {
        th: `ถอดสาย ${removed} เส้นที่ขากว้างไม่ตรงแล้ว`,
        en: `Removed ${removed} wire(s) whose pin width no longer matches`,
      };
      model.ui.setCamera(model.ui.camera);
    }
  };
  const label = inst.defId === 'prim.split' ? 'แยก bus' : 'รวม bus';
  return (
    <section className="part-settings" aria-label={`ตั้งค่า ${inst.id}`}>
      <h3>
        ⚙ {label} <span className="muted mono">{inst.id}</span>
      </h3>
      <label>
        ความกว้าง
        <select value={width} onChange={(e) => apply({ width: Number(e.target.value) })}>
          {BUS_WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w} บิต
            </option>
          ))}
        </select>
      </label>
      <label>
        แบ่งเป็น
        <select value={parts} onChange={(e) => apply({ width, parts: Number(e.target.value) })}>
          {divisors.map((d) => (
            <option key={d} value={d}>
              {d} ส่วน ส่วนละ {width / d} บิต
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

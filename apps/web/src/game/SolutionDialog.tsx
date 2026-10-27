// ดูเฉลยของด่าน: คำอธิบายหลักการว่าทำไมต่อแบบนี้ + วงจรเฉลยบนพื้นที่วาดแบบดูอย่างเดียว (ด่านเขียนโปรแกรมแสดงโปรแกรมเฉลย)
// เปิดได้ทุกเมื่อ (ถามยืนยันก่อน) วงจรของผู้เล่นไม่ถูกแตะ
import { ComponentLibrary } from '@z-ncpu/engine';
import { LEVELS } from '@z-ncpu/content';
import type { ComponentDef, LevelDef } from '@z-ncpu/shared';
import { BookKey, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CircuitCanvas } from '../editor/CircuitCanvas';
import { EditorModel } from '../editor/model';
import { Markdown } from '../ui/Markdown';
import { loadExplanation, loadSolution, type Solution } from './solution';

type Loaded = { solution: Solution | null; text: string | null; model: EditorModel | null };
type State = { k: 'loading' } | { k: 'error'; message: string } | ({ k: 'ready' } & Loaded);

/** เน็ตช้าหรือหลุดระหว่างโหลด: เลิกรอแล้วให้กดลองใหม่ ไม่ค้างที่ "กำลังโหลด" ตลอดไป */
const LOAD_TIMEOUT_MS = 15_000;

/** โหลดล่วงหน้าตอนเอาเมาส์ชี้หรือโฟกัสปุ่ม กดแล้วจะขึ้นทันที (โหลดซ้ำไม่เปลืองเพราะเบราว์เซอร์จำไว้) */
function prefetch(levelId: string): void {
  void loadSolution(levelId).catch(() => undefined);
  void loadExplanation(levelId).catch(() => undefined);
}

/** ชิ้นที่เฉลยใช้: ใช้ของผู้เล่นถ้ามี ไม่งั้นใช้เฉลยของด่านที่สร้างชิ้นนั้น (ไว้วาดขาให้ถูก) */
async function libraryFor(def: ComponentDef, components: readonly ComponentDef[]): Promise<ComponentLibrary> {
  const have = new Map(components.filter((c) => c.id !== def.id).map((c) => [c.id, c]));
  const want = new Set<string>();
  const visit = (d: ComponentDef): void => {
    for (const i of d.body?.instances ?? []) if (i.defId.startsWith('user.') && !want.has(i.defId)) want.add(i.defId);
  };
  visit(def);
  // ชิ้นที่ผู้เล่นยังไม่มี: โหลดเฉลยของด่านที่สร้างชิ้นนั้น (ไล่ลงไปทุกชั้น)
  const queue = [...want];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (have.has(id)) continue;
    const level = LEVELS.find((l) => l.target.defId === id && l.tests.type !== 'program');
    const s = level ? await loadSolution(level.id) : null;
    if (s?.kind !== 'circuit') continue;
    have.set(id, s.def);
    for (const i of s.def.body?.instances ?? []) if (i.defId.startsWith('user.') && !have.has(i.defId)) queue.push(i.defId);
  }
  return new ComponentLibrary([...have.values()]);
}

export function SolutionButton({ level, components }: { level: LevelDef; components: readonly ComponentDef[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onPointerEnter={() => prefetch(level.id)}
        onFocus={() => prefetch(level.id)}
        onClick={() => {
          if (window.confirm('ดูเฉลยของด่านนี้? ลองขอคำใบ้หรือใช้ Why? ดูก่อนก็ได้ (วงจรของคุณจะไม่ถูกแก้)')) setOpen(true);
        }}
      >
        <BookKey size={16} aria-hidden /> ดูเฉลย
      </button>
      {open ? <SolutionDialog level={level} components={components} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SolutionDialog({ level, components, onClose }: { level: LevelDef; components: readonly ComponentDef[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ k: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let active = true;
    setState({ k: 'loading' });
    const load = async (): Promise<Loaded> => {
      const [solution, text] = await Promise.all([loadSolution(level.id), loadExplanation(level.id)]);
      let model: EditorModel | null = null;
      if (solution?.kind === 'circuit') {
        // แสดงชื่อของแต่ละชิ้น (nand1, xor2, …) บนวงจร คำอธิบายจะได้อ้างถึงได้ตรงตัว
        const body = solution.def.body ?? { instances: [], wires: [] };
        const labelled: ComponentDef = { ...solution.def, body: { ...body, instances: body.instances.map((i) => ({ ...i, label: i.label ?? i.id })) } };
        model = new EditorModel(labelled, await libraryFor(solution.def, components), { readOnly: true });
      }
      return { solution, text, model };
    };
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS);
    });
    Promise.race([load(), timeout])
      .then((loaded) => {
        if (active) setState({ k: 'ready', ...loaded });
      })
      .catch((e: unknown) => {
        console.warn('โหลดเฉลยไม่ได้', e);
        if (!active) return;
        const slow = e instanceof Error && e.message === 'timeout';
        setState({
          k: 'error',
          message: slow
            ? 'โหลดเฉลยนานเกินไป (อินเทอร์เน็ตช้าหรือหลุด) ลองอีกครั้ง'
            : 'โหลดเฉลยไม่ได้ อาจเพราะเกมเพิ่งอัปเดต ลองอีกครั้ง หรือรีโหลดหน้าแล้วเปิดใหม่',
        });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // โหลดใหม่เฉพาะตอนเปิดหรือกดลองอีกครั้ง
  }, [level.id, attempt]);

  const loaded = state.k === 'ready' ? state : null;
  const program = loaded?.solution?.kind === 'program' ? loaded.solution.source : null;
  return (
    <dialog
      ref={ref}
      className="solution-dialog"
      aria-labelledby="solution-title"
      // ปิดด้วยปุ่ม × หรือ Esc เท่านั้น (คลิกพื้นหลังพลาดแล้วหายทั้งที่ยังอ่านไม่จบ)
      onClose={onClose}
    >
      <div className="solution-head">
        <h2 id="solution-title" className="with-icon">
          <BookKey size={18} aria-hidden /> เฉลย: {level.title.th}
        </h2>
        <button className="icon-close" aria-label="ปิดเฉลย" onClick={() => ref.current?.close()}>
          <X size={20} aria-hidden />
        </button>
      </div>
      {state.k === 'loading' ? (
        <p className="muted" role="status">
          กำลังโหลดเฉลย…
        </p>
      ) : state.k === 'error' || !loaded ? (
        <div role="alert" className="solution-error">
          <p className="error">{state.k === 'error' ? state.message : ''}</p>
          <button onClick={() => setAttempt((n) => n + 1)}>
            <RotateCw size={16} aria-hidden /> ลองอีกครั้ง
          </button>
        </div>
      ) : (
        <div className={`solution-body ${loaded.model ? 'with-canvas' : ''}`}>
          <article className="solution-text" data-testid="solution-text">
            {loaded.text ? <Markdown text={loaded.text} headingOffset={2} /> : <p className="muted">ยังไม่มีคำอธิบายของด่านนี้</p>}
            {level.optimize?.bestNand !== undefined ? <p className="muted small">เฉลยนี้ใช้ NAND {level.optimize.bestNand} ตัว ซึ่งน้อยที่สุดที่ทำได้</p> : null}
          </article>
          {loaded.model ? (
            <section className="solution-canvas" aria-label="วงจรเฉลย">
              <p className="muted small">วงจรเฉลย (ดูอย่างเดียว ไม่ได้จำลองไฟในสาย) ลากเพื่อเลื่อน ล้อเมาส์หรือสองนิ้วเพื่อซูม · วงจรของคุณไม่ถูกแก้</p>
              <CircuitCanvas model={loaded.model} values={{}} testHook={false} label={`วงจรเฉลยของด่าน ${level.title.th} (ดูอย่างเดียว)`} />
            </section>
          ) : null}
          {program !== null ? (
            <section className="solution-program" aria-label="โปรแกรมเฉลย">
              <h3>โปรแกรมเฉลย</h3>
              <pre className="asm mono" data-testid="solution-program">
                {program}
              </pre>
              <button onClick={() => void navigator.clipboard?.writeText(program)}>คัดลอกโปรแกรม</button>
            </section>
          ) : null}
        </div>
      )}
    </dialog>
  );
}

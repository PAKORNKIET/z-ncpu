// หน้าด่าน (M1-3): รายการด่าน → บทเรียน → ต่อวงจร → ทดสอบ → ปลดล็อกชิ้นใหม่
import { ComponentLibrary, contentHash } from '@z-ncpu/engine';
import { GLOSSARY, HINTS_TH, LEVELS } from '@z-ncpu/content';
import type { ComponentDef, Diagnostic, LevelDef, SignalValue, TestReport } from '@z-ncpu/shared';
import { useState } from 'react';
import { EngineClosedError } from '../engine-client';
import { PRIMITIVE_PALETTE, Workbench, type PaletteItem, type WorkbenchContext } from '../editor/Workbench';
import { Markdown } from '../ui/Markdown';
import { Diagnostics } from '../ui/widgets';
import { lessonText } from './lessons';
import {
  availableParts,
  draftFor,
  firstUnfinished,
  levelStatus,
  partName,
  putComponent,
  recordTest,
  type HashOf,
  type LevelStatus,
} from './progress';
import type { SaveFile } from './save';

export const hashOf: HashOf = (components, defId) => contentHash(new ComponentLibrary(components), defId);

const STATUS_TEXT: Record<LevelStatus, string> = {
  locked: 'ยังล็อกอยู่',
  open: 'ยังไม่ผ่าน',
  passed: 'ผ่านแล้ว',
  retest: 'แก้วงจรแล้ว ต้องทดสอบใหม่',
};
const STATUS_ICON: Record<LevelStatus, string> = { locked: '🔒', open: '○', passed: '✓', retest: '↻' };

/** ชิ้นของผู้เล่นในกล่องเครื่องมือ: บอกว่ามาจากด่านไหน */
export function paletteFor(ids: readonly string[]): PaletteItem[] {
  return ids.map((id) => {
    const prim = PRIMITIVE_PALETTE[id];
    if (prim) return prim;
    const from = LEVELS.find((l) => l.unlocks.includes(id));
    return { defId: id, title: partName(id), desc: from ? `สร้างเองในด่าน "${from.title.th}"` : 'ชิ้นที่สร้างเอง' };
  });
}

export function GamePage(props: { save: SaveFile; setSave: (f: (s: SaveFile) => SaveFile) => void; generation: number }) {
  const { save, setSave } = props;
  const [index, setIndex] = useState(() => firstUnfinished(LEVELS, save));
  const level = LEVELS[index]!;
  const statuses = LEVELS.map((_, i) => levelStatus(LEVELS, i, save, hashOf));

  return (
    <div className="game">
      <nav className="levels" aria-label="ด่าน">
        <h2>บทที่ 1 · ตรรกะพื้นฐาน</h2>
        <ol>
          {LEVELS.map((l, i) => (
            <li key={l.id}>
              <button
                className={`level-item ${statuses[i]} ${i === index ? 'current' : ''}`}
                disabled={statuses[i] === 'locked'}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => setIndex(i)}
                aria-label={`ด่าน ${i + 1} ${l.title.th}: ${STATUS_TEXT[statuses[i]!]}`}
              >
                <span className="level-icon" aria-hidden>
                  {STATUS_ICON[statuses[i]!]}
                </span>
                <span>
                  {i + 1}. {l.title.th}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="muted small">ด่าน OR, XOR, Adder และ Flip-Flop จะเพิ่มในขั้นถัดไป</p>
      </nav>

      <div className="level-main">
        <Lesson level={level} />
        <Workbench
          key={`${level.id}#${props.generation}`}
          initial={draftFor(level, save)}
          deps={save.components.filter((c) => c.id !== level.target.defId)}
          palette={paletteFor(availableParts(level, LEVELS, save))}
          onChange={(def) => setSave((s) => putComponent(s, def))}
          side={(ctx) => (
            <TestPanel
              level={level}
              status={statuses[index]!}
              save={save}
              ctx={ctx}
              onResult={(def, passed, nand) =>
                setSave((s) => {
                  const withDef = putComponent(s, def);
                  return recordTest(withDef, level.id, { passed, nand, hash: hashOf(withDef.components, def.id) });
                })
              }
              next={index + 1 < LEVELS.length ? () => setIndex(index + 1) : undefined}
            />
          )}
        />
      </div>
    </div>
  );
}

function Lesson({ level }: { level: LevelDef }) {
  // หัวข้อแรกของบทเรียนซ้ำกับชื่อด่านที่แสดงอยู่แล้ว
  const text = lessonText('th', level.lesson)?.replace(/^#\s+.*\n/, '');
  const terms = GLOSSARY.filter((g) => level.glossary.includes(g.id));
  return (
    <details className="lesson" open>
      <summary>
        บทเรียน: <strong>{level.title.th}</strong>
      </summary>
      <div className="lesson-body">
        {text ? <Markdown text={text} /> : <p className="muted">ยังไม่มีบทเรียนของด่านนี้</p>}
        {terms.length > 0 ? (
          <dl className="glossary">
            {terms.map((g) => (
              <div key={g.id}>
                <dt>
                  {g.th} <span className="muted">({g.en})</span>
                </dt>
                <dd>{g.explain_th}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </details>
  );
}

type TestState =
  | { k: 'idle' }
  | { k: 'running' }
  | { k: 'done'; report: TestReport | null; diagnostics: Diagnostic[]; nand: number | null; hash: string };

function TestPanel(props: {
  level: LevelDef;
  status: LevelStatus;
  save: SaveFile;
  ctx: WorkbenchContext;
  onResult: (def: ComponentDef, passed: boolean, nand: number) => void;
  next?: (() => void) | undefined;
}) {
  const { level, ctx } = props;
  const [state, setState] = useState<TestState>({ k: 'idle' });
  const [hints, setHints] = useState(0);
  const progress = props.save.progress[level.id];
  const best = level.optimize?.bestNand;
  /** hash ของวงจรตอนนี้ (ไม่นับตำแหน่ง) ใช้รู้ว่าผลทดสอบที่แสดงยังตรงกับวงจรไหม */
  const hashNow = (def: ComponentDef): string => hashOf(putComponent(props.save, def).components, def.id);

  const run = async (): Promise<void> => {
    if (!ctx.client) return;
    const tested = ctx.def;
    const nand = ctx.gates;
    setState({ k: 'running' });
    try {
      const res = await ctx.client.send({ type: 'test', defId: tested.id, tests: level.tests, mode: 'fast' });
      if (res.type !== 'testResult') return;
      setState({ k: 'done', report: res.report, diagnostics: res.diagnostics, nand, hash: hashNow(tested) });
      props.onResult(tested, !!res.report?.passed, nand ?? 0);
    } catch (e) {
      if (!(e instanceof EngineClosedError)) console.error(e);
    }
  };

  // ผลที่แสดงเป็นของวงจรที่ทดสอบ ถ้าแก้วงจรหลังจากนั้น (ไม่นับแค่ย้ายตำแหน่ง) บอกให้ทดสอบใหม่
  const result = state.k === 'done' ? state : null;
  const stale = result !== null && result.hash !== hashNow(ctx.def);
  const passed = !!result?.report?.passed && !stale;

  return (
    <section className="test-panel" aria-labelledby="test-title">
      <h2 id="test-title">ทดสอบ</h2>
      <p className="muted small" data-testid="level-status">
        สถานะ: {STATUS_TEXT[props.status]}
        {progress?.bestNand !== undefined ? ` · ดีที่สุด ${progress.bestNand} NAND` : ''}
      </p>
      <button className="primary" onClick={() => void run()} disabled={!ctx.client || state.k === 'running'}>
        {state.k === 'running' ? 'กำลังทดสอบ…' : '▶ ทดสอบ'}
      </button>

      <TruthTable level={level} report={stale ? null : (result?.report ?? null)} />

      <div role="status" aria-live="polite" className="test-result">
        {stale ? <p className="muted">วงจรเปลี่ยนแล้ว กดทดสอบอีกครั้ง</p> : null}
        {result && !stale && result.report && !result.report.passed ? (
          <p className="error">
            ✗ ยังไม่ผ่าน: ถูก {result.report.total - result.report.failed} จาก {result.report.total} แถว
            {result.report.firstFailure ? ` · ดูแถวที่ ${result.report.firstFailure.index + 1}` : ''}
          </p>
        ) : null}
        {result && !stale && !result.report ? (
          <>
            <p className="error">✗ วงจรนี้ยังจำลองไม่ได้</p>
            <Diagnostics items={result.diagnostics.filter((d) => d.severity === 'error')} />
          </>
        ) : null}
        {passed ? (
          <div className="pass">
            <p>
              <strong>✓ ผ่านด่านแล้ว!</strong> {level.unlocks.map(partName).join(', ')} อยู่ในกล่องชิ้นส่วนของด่านถัดไปแล้ว
            </p>
            {result.nand !== null ? (
              <p className="small">
                ใช้ NAND {result.nand} ตัว
                {best !== undefined
                  ? result.nand <= best
                    ? ' · น้อยที่สุดที่ทำได้แล้ว'
                    : ` · ลองให้เหลือ ${best} ตัวดูไหม`
                  : ''}
              </p>
            ) : null}
            {props.next ? (
              <button className="primary" onClick={props.next}>
                ด่านถัดไป →
              </button>
            ) : (
              <p className="small muted">ผ่านครบทุกด่านที่มีตอนนี้แล้ว</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="hints">
        {level.hints.slice(0, hints).map((h, i) => (
          <p key={h} className="hint-text">
            💡 คำใบ้ {i + 1}: {HINTS_TH[h]}
          </p>
        ))}
        {hints < level.hints.length ? (
          <button onClick={() => setHints(hints + 1)}>
            ขอคำใบ้ ({hints}/{level.hints.length})
          </button>
        ) : null}
      </div>
    </section>
  );
}

const show = (v: SignalValue | undefined): string => (v === undefined ? '' : String(v));

/** ตารางความจริงของด่าน: ก่อนทดสอบแสดงค่าที่ต้องได้ หลังทดสอบเพิ่มค่าที่ได้จริงและเครื่องหมายถูก/ผิด */
function TruthTable({ level, report }: { level: LevelDef; report: TestReport | null }) {
  if (level.tests.type !== 'truth-table') return null;
  const rows = level.tests.rows;
  const ins = level.target.pins.filter((p) => p.dir === 'in').map((p) => p.name);
  const outs = level.target.pins.filter((p) => p.dir === 'out').map((p) => p.name);
  return (
    <table className="truth-table" aria-label="ตารางความจริง">
      <thead>
        <tr>
          <th scope="col">#</th>
          {ins.map((n) => (
            <th key={n} scope="col">
              {n}
            </th>
          ))}
          {outs.map((n) => (
            <th key={n} scope="col">
              {n} ที่ต้องได้
            </th>
          ))}
          {report
            ? outs.map((n) => (
                <th key={`a${n}`} scope="col">
                  {n} ที่ได้
                </th>
              ))
            : null}
          {report ? <th scope="col">ผล</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const r = report?.results[i];
          return (
            <tr key={i} className={r ? (r.ok ? 'ok' : 'fail') : undefined}>
              <td>{i + 1}</td>
              {ins.map((n) => (
                <td key={n}>{show(row.in[n])}</td>
              ))}
              {outs.map((n) => (
                <td key={n}>{show(row.out[n])}</td>
              ))}
              {report ? outs.map((n) => <td key={`a${n}`}>{show(r?.actual[n])}</td>) : null}
              {report ? <td aria-label={r?.ok ? 'ถูก' : 'ผิด'}>{r?.ok ? '✓' : '✗'}</td> : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// หน้าด่าน (M1-3): รายการด่าน → บทเรียน → ต่อวงจร → ทดสอบ → ปลดล็อกชิ้นใหม่
import { ComponentLibrary, contentHash } from '@z-ncpu/engine';
import { CHAPTERS, GLOSSARY, HINTS_TH, LEVELS } from '@z-ncpu/content';
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
export function paletteFor(ids: readonly string[], busWidth = 4): PaletteItem[] {
  return ids.map((id) => {
    const prim = PRIMITIVE_PALETTE[id];
    if (prim) {
      if (!prim.params?.width || busWidth === prim.params.width) return prim;
      // ตัวแยก/รวมบัสเริ่มที่ความกว้างของบัสในด่านนั้น
      const desc = id === 'prim.split' ? `บัส ${busWidth} บิต → บิตเดี่ยว (b0 = บิตขวาสุด)` : `บิตเดี่ยว → บัส ${busWidth} บิต`;
      return { ...prim, params: { width: busWidth }, desc };
    }
    const from = LEVELS.find((l) => l.unlocks.includes(id));
    return { defId: id, title: partName(id, LEVELS), desc: from ? `สร้างเองในด่าน "${from.title.th}"` : 'ชิ้นที่สร้างเอง' };
  });
}

/** ความกว้างบัสที่กว้างที่สุดของด่าน (อย่างน้อย 4) */
const busWidthOf = (level: LevelDef): number => Math.max(4, ...level.target.pins.map((p) => (p.width > 1 ? p.width : 0)));

export function GamePage(props: { save: SaveFile; setSave: (f: (s: SaveFile) => SaveFile) => void; generation: number }) {
  const { save, setSave } = props;
  const [index, setIndex] = useState(() => firstUnfinished(LEVELS, save));
  const level = LEVELS[index]!;
  const statuses = LEVELS.map((_, i) => levelStatus(LEVELS, i, save, hashOf));

  return (
    <div className="game">
      <nav className="levels" aria-label="ด่าน">
        {Object.entries(CHAPTERS).map(([ch, title]) => (
          <section key={ch} className="chapter">
            <h2>
              บทที่ {ch} · {title.th}
            </h2>
            <ol>
              {LEVELS.map((l, i) =>
                l.chapter !== Number(ch) ? null : (
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
                ),
              )}
            </ol>
          </section>
        ))}
        <p className="muted small">บทถัดไป (ALU, หน่วยความจำ, CPU) มาใน M2–M3</p>
      </nav>

      <div className="level-main">
        <Lesson key={level.id} level={level} startOpen={statuses[index] !== 'passed'} />
        <Workbench
          key={`${level.id}#${props.generation}`}
          initial={draftFor(level, save)}
          deps={save.components.filter((c) => c.id !== level.target.defId)}
          palette={paletteFor(availableParts(level, LEVELS, save), busWidthOf(level))}
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

function Lesson({ level, startOpen }: { level: LevelDef; startOpen: boolean }) {
  // ด่านที่ผ่านแล้วเริ่มแบบพับบทเรียนไว้ พื้นที่ต่อวงจรจะได้อยู่ในจอ
  const [open] = useState(startOpen);
  // หัวข้อแรกของบทเรียนซ้ำกับชื่อด่านที่แสดงอยู่แล้ว
  const text = lessonText('th', level.lesson)?.replace(/^#\s+.*\n/, '');
  const terms = GLOSSARY.filter((g) => level.glossary.includes(g.id));
  return (
    <details className="lesson" open={open}>
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

      {level.tests.type === 'truth-table' ? (
        <TruthTable level={level} report={stale ? null : (result?.report ?? null)} />
      ) : level.tests.type === 'sequence' ? (
        <SequenceTable level={level} report={stale ? null : (result?.report ?? null)} />
      ) : (
        <ReferenceTable level={level} report={stale ? null : (result?.report ?? null)} />
      )}

      <div role="status" aria-live="polite" className="test-result">
        {stale ? <p className="muted">วงจรเปลี่ยนแล้ว กดทดสอบอีกครั้ง</p> : null}
        {result && !stale && result.report && !result.report.passed ? (
          <p className="error">
            ✗ ยังไม่ผ่าน: ถูก {result.report.total - result.report.failed} จาก {result.report.total} แถว
            {result.report.firstFailure
              ? level.tests.type === 'reference'
                ? ''
                : ` · ดู${level.tests.type === 'sequence' ? 'ขั้น' : 'แถว'}ที่ ${result.report.firstFailure.index + 1}`
              : ''}
          </p>
        ) : null}
        {result && !stale && result.report?.error ? <p className="error">⚠ {result.report.error.message.th}</p> : null}
        {result && !stale && !result.report ? (
          <>
            <p className="error">✗ วงจรนี้ยังจำลองไม่ได้</p>
            <Diagnostics items={result.diagnostics.filter((d) => d.severity === 'error')} />
          </>
        ) : null}
        {passed ? (
          <div className="pass">
            <p>
              <strong>✓ ผ่านด่านแล้ว!</strong> {level.unlocks.map((id) => partName(id, LEVELS)).join(', ')} อยู่ในกล่องชิ้นส่วนของด่านถัดไปแล้ว
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
    <div className="table-scroll">
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
    </div>
  );
}

/** การทดสอบแบบลำดับเวลา (วงจรจำค่า): แต่ละขั้นตั้งค่าขาเข้า เดินนาฬิกา แล้วตรวจขาออก */
function SequenceTable({ level, report }: { level: LevelDef; report: TestReport | null }) {
  if (level.tests.type !== 'sequence') return null;
  const steps = level.tests.steps;
  const outs = level.target.pins.filter((p) => p.dir === 'out').map((p) => p.name);
  const setText = (set: Record<string, SignalValue> | undefined): string =>
    set ? Object.entries(set).map(([k, v]) => `${k}=${show(v)}`).join(' ') : '–';
  return (
    <div className="table-scroll">
      <table className="truth-table" aria-label="ลำดับการทดสอบ">
        <thead>
          <tr>
            <th scope="col">ขั้น</th>
            <th scope="col">ตั้งค่า</th>
            {level.tests.clock ? <th scope="col">นาฬิกา</th> : null}
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
          {steps.map((step, i) => {
            const r = report?.results.find((x) => x.index === i);
            return (
              <tr key={i} className={r ? (r.ok ? 'ok' : 'fail') : undefined}>
                <td>{i + 1}</td>
                <td className="left">{setText(step.set)}</td>
                {level.tests.type === 'sequence' && level.tests.clock ? <td>{step.tick ? `⏱×${step.tick}` : '–'}</td> : null}
                {outs.map((n) => (
                  <td key={n}>{show(step.expect?.[n])}</td>
                ))}
                {report ? outs.map((n) => <td key={`a${n}`}>{show(r?.actual[n])}</td>) : null}
                {report ? <td aria-label={r ? (r.ok ? 'ถูก' : 'ผิด') : 'ไม่ได้ตรวจ'}>{r ? (r.ok ? '✓' : '✗') : ''}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * ด่านที่ขาเข้ากว้างเกินจะทดสอบครบทุกกรณี: engine สร้างกรณีขอบ + สุ่มเอง จึงไม่มีตารางให้ดูก่อนทดสอบ
 * หลังทดสอบแสดงแถวที่ผิด (ไม่เกิน 30 แถว) หรือตัวอย่างแถวที่ถูกถ้าผ่านทั้งหมด
 */
function ReferenceTable({ level, report }: { level: LevelDef; report: TestReport | null }) {
  if (level.tests.type !== 'reference') return null;
  const ins = level.target.pins.filter((p) => p.dir === 'in').map((p) => p.name);
  const outs = level.target.pins.filter((p) => p.dir === 'out').map((p) => p.name);
  if (!report) {
    const bits = level.target.pins.filter((p) => p.dir === 'in').reduce((n, p) => n + p.width, 0);
    return (
      <p className="muted small" data-testid="reference-info">
        {bits <= 16
          ? `ทดสอบครบทุกกรณี ${(2 ** bits).toLocaleString()} แบบ`
          : `ขาเข้ามี ${(2 ** bits).toLocaleString()} แบบ ลองครบไม่ไหว จึงทดสอบกรณีขอบ (0, ค่ามากสุด, บิตเครื่องหมาย ฯลฯ) + สุ่มอีก ${(level.tests.samples ?? 2000).toLocaleString()} แบบ`}
      </p>
    );
  }
  const failed = report.results.filter((r) => !r.ok);
  const shown = (failed.length > 0 ? failed : report.results).slice(0, 30);
  return (
    <>
      <p className="muted small">
        ทดสอบ {report.total.toLocaleString()} แบบ ·{' '}
        {failed.length > 0 ? `ผิด ${failed.length.toLocaleString()} แบบ (แสดง ${shown.length} แบบแรก)` : `ตัวอย่าง ${shown.length} แบบ`}
      </p>
      <div className="table-scroll">
        <table className="truth-table" aria-label="ผลการทดสอบ">
          <thead>
            <tr>
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
              {outs.map((n) => (
                <th key={`a${n}`} scope="col">
                  {n} ที่ได้
                </th>
              ))}
              <th scope="col">ผล</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.index} className={r.ok ? 'ok' : 'fail'}>
                {ins.map((n) => (
                  <td key={n}>{show(r.inputs[n])}</td>
                ))}
                {outs.map((n) => (
                  <td key={n}>{show(r.expected[n])}</td>
                ))}
                {outs.map((n) => (
                  <td key={`a${n}`}>{show(r.actual[n])}</td>
                ))}
                <td aria-label={r.ok ? 'ถูก' : 'ผิด'}>{r.ok ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

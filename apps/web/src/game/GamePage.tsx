// หน้าด่าน (M1-3): รายการด่าน → บทเรียน → ต่อวงจร → ทดสอบ → ปลดล็อกชิ้นใหม่
import { ComponentLibrary, contentHash } from '@z-ncpu/engine';
import { CHAPTERS, GLOSSARY, HINTS_TH, LEVELS } from '@z-ncpu/content';
import { assemble, disassemble } from '@z-ncpu/isa';
import type { ComponentDef, Diagnostic, LevelDef, SignalValue, TestCaseResult, TestReport } from '@z-ncpu/shared';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Cpu,
  Lightbulb,
  ListOrdered,
  Lock,
  Play,
  RotateCw,
  Timer,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OkMark } from '../ui/icons';
import { EngineClosedError } from '../engine-client';
import { PRIMITIVE_PALETTE, Workbench, type PaletteItem, type WorkbenchContext } from '../editor/Workbench';
import { Markdown } from '../ui/Markdown';
import { Diagnostics } from '../ui/widgets';
import { ProgramLevel } from './ProgramLevel';
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
const STATUS_ICON: Record<LevelStatus, LucideIcon> = { locked: Lock, open: Circle, passed: CheckCircle2, retest: RotateCw };

/** ชิ้นของผู้เล่นในกล่องเครื่องมือ: บอกว่ามาจากด่านไหน */
export function paletteFor(ids: readonly string[], busWidth = 4): PaletteItem[] {
  return ids.map((id) => {
    const prim = PRIMITIVE_PALETTE[id];
    if (prim) {
      if (!prim.params?.width || busWidth === prim.params.width) return prim;
      // ตัวแยก/รวมบัสเริ่มที่ความกว้างของบัสในด่านนั้น มัดสายที่กว้างเกิน 16 บิตเริ่มแบบแบ่งเป็นคำละ 16 บิต
      if (busWidth > 16) {
        const parts = busWidth / 16;
        const desc = id === 'prim.split' ? `มัดสาย ${busWidth} บิต → ${parts} คำ คำละ 16 บิต` : `${parts} คำ → มัดสาย ${busWidth} บิต`;
        return { ...prim, params: { width: busWidth, parts }, desc };
      }
      const desc = id === 'prim.split' ? `บัส ${busWidth} บิต → บิตเดี่ยว (b0 = บิตขวาสุด)` : `บิตเดี่ยว → บัส ${busWidth} บิต`;
      return { ...prim, params: { width: busWidth }, desc };
    }
    const from = LEVELS.find((l) => l.unlocks.includes(id));
    return { defId: id, title: partName(id, LEVELS), desc: from ? `สร้างเองในด่าน "${from.title.th}"` : 'ชิ้นที่สร้างเอง' };
  });
}

/** ความกว้างบัสที่กว้างที่สุดของด่าน (อย่างน้อย 4) */
// ด่าน CPU: มัดสาย prog (4,096 บิต) ต่อกับแผงให้แล้ว ตัวแยกบัสจึงเริ่มที่ 16 บิต (กว้างเท่าคำสั่ง)
const busWidthOf = (level: LevelDef): number =>
  level.tests.type === 'cpu' ? 16 : Math.max(4, ...level.target.pins.map((p) => (p.width > 1 ? p.width : 0)));

export function GamePage(props: { save: SaveFile; setSave: (f: (s: SaveFile) => SaveFile) => void; generation: number }) {
  const { save, setSave } = props;
  const [index, setIndex] = useState(() => firstUnfinished(LEVELS, save));
  const level = LEVELS[index]!;
  const statuses = LEVELS.map((_, i) => levelStatus(LEVELS, i, save, hashOf));
  /** จอแคบ: รายการด่านพับเก็บไว้ เปิดด้วยปุ่มด้านบน */
  const [levelsOpen, setLevelsOpen] = useState(false);
  const passedCount = statuses.filter((st) => st === 'passed').length;

  // บทที่เปิดดูอยู่: เริ่มจากบทของด่านปัจจุบัน และบทที่ยังเล่นอยู่ (บทที่ผ่านหมดแล้วหรือยังล็อกทั้งบทพับไว้ รายการจะได้ไม่ยาว)
  const chapterIds = Object.keys(CHAPTERS).map(Number);
  const levelsOf = (ch: number) => LEVELS.map((l, i) => ({ l, i })).filter(({ l }) => l.chapter === ch);
  const [openChapters, setOpenChapters] = useState<Set<number>>(
    () =>
      new Set(
        chapterIds.filter((ch) => {
          const st = levelsOf(ch).map(({ i }) => statuses[i]);
          return ch === level.chapter || !(st.every((x) => x === 'passed') || st.every((x) => x === 'locked'));
        }),
      ),
  );
  // เปลี่ยนด่าน: เปิดบทของด่านนั้น
  useEffect(() => {
    setOpenChapters((open) => (open.has(level.chapter) ? open : new Set([...open, level.chapter])));
  }, [level.chapter]);
  const toggleChapter = (ch: number): void =>
    setOpenChapters((open) => {
      const next = new Set(open);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });

  // เลื่อนเฉพาะรายการด่าน (ไม่เลื่อนทั้งหน้า) ให้เห็นด่านปัจจุบัน
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const box = listRef.current;
    const item = box?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!box || !item || box.scrollHeight <= box.clientHeight) return;
    const top = item.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top < box.scrollTop || top + item.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top - box.clientHeight / 3;
  }, [index, levelsOpen]);

  return (
    <div className="game">
      <button className="levels-toggle" aria-expanded={levelsOpen} aria-controls="level-list" onClick={() => setLevelsOpen(!levelsOpen)}>
        <ListOrdered size={18} aria-hidden />
        <span>
          ด่าน {index + 1}/{LEVELS.length}: <strong>{level.title.th}</strong>
        </span>
        <span className="muted small">ผ่าน {passedCount}</span>
        <ChevronDown size={18} aria-hidden className="chevron" />
      </button>
      <nav id="level-list" ref={listRef} className={`levels ${levelsOpen ? 'open' : ''}`} aria-label="ด่าน">
        {Object.entries(CHAPTERS).map(([ch, title]) => {
          const n = Number(ch);
          const inChapter = levelsOf(n);
          const done = inChapter.filter(({ i }) => statuses[i] === 'passed').length;
          const open = openChapters.has(n);
          return (
          <section key={ch} className="chapter">
            <h2>
              <button className="chapter-toggle" aria-expanded={open} aria-controls={`chapter-${ch}`} onClick={() => toggleChapter(n)}>
                <ChevronRight size={14} aria-hidden className="ch-arrow" />
                <span className="chapter-title">
                  บทที่ {ch} · {title.th}
                </span>
                <span className={`chapter-count ${done === inChapter.length ? 'done' : ''}`}>
                  {done}/{inChapter.length}
                </span>
              </button>
            </h2>
            <ol id={`chapter-${ch}`} hidden={!open}>
              {LEVELS.map((l, i) =>
                l.chapter !== n ? null : (
                  <li key={l.id}>
                    <button
                      className={`level-item ${statuses[i]} ${i === index ? 'current' : ''}`}
                      disabled={statuses[i] === 'locked'}
                      aria-current={i === index ? 'step' : undefined}
                      onClick={() => {
                        setIndex(i);
                        setLevelsOpen(false);
                      }}
                      aria-label={`ด่าน ${i + 1} ${l.title.th}: ${STATUS_TEXT[statuses[i]!]}`}
                    >
                      <span className="level-icon" aria-hidden>
                        {(() => {
                          const Icon = STATUS_ICON[statuses[i]!];
                          return <Icon size={16} />;
                        })()}
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
          );
        })}
        <p className="muted small">บทถัดไป (ภารกิจขั้นสูง) มาใน M5</p>
      </nav>

      <div className="level-main">
        <Lesson key={level.id} level={level} startOpen={statuses[index] !== 'passed'} />
        {level.tests.type === 'program' ? (
          <ProgramLevel
            key={`${level.id}#${props.generation}`}
            level={level}
            save={save}
            setSave={setSave}
            status={statuses[index]!}
            next={index + 1 < LEVELS.length ? () => setIndex(index + 1) : undefined}
          />
        ) : (
          <Workbench
            key={`${level.id}#${props.generation}`}
            initial={draftFor(level, save)}
            deps={save.components.filter((c) => c.id !== level.target.defId)}
            palette={paletteFor(availableParts(level, LEVELS, save), busWidthOf(level))}
            onChange={(def) => setSave((s) => putComponent(s, def))}
            {...(level.devices ? { devices: level.devices } : {})}
            {...(level.tests.type === 'rom' ? { romPanel: { words: level.tests.words, width: level.tests.width } } : {})}
            {...(level.tests.type === 'cpu' ? { cpuProgram: samplePrograms(level) } : {})}
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
        )}
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
        <ChevronDown size={18} aria-hidden className="chevron" />
        <BookOpen size={18} aria-hidden />
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
        {state.k === 'running' ? (
          'กำลังทดสอบ…'
        ) : (
          <>
            <Play size={16} aria-hidden />
            ทดสอบ
          </>
        )}
      </button>

      {level.tests.type === 'truth-table' ? (
        <TruthTable level={level} report={stale ? null : (result?.report ?? null)} />
      ) : level.tests.type === 'sequence' ? (
        <SequenceTable level={level} report={stale ? null : (result?.report ?? null)} />
      ) : level.tests.type === 'cpu' ? (
        <CpuTable level={level} report={stale ? null : (result?.report ?? null)} />
      ) : (
        <ReferenceTable level={level} report={stale ? null : (result?.report ?? null)} />
      )}

      <div role="status" aria-live="polite" className="test-result">
        {stale ? <p className="muted">วงจรเปลี่ยนแล้ว กดทดสอบอีกครั้ง</p> : null}
        {result && !stale && result.report && !result.report.passed ? (
          <p className="error with-icon">
            <XCircle size={18} aria-hidden />
            {level.tests.type === 'cpu'
              ? 'ยังไม่ผ่าน: CPU ทำงานไม่ตรงกับ emulator (ดูรายละเอียดด้านบน)'
              : `ยังไม่ผ่าน: ถูก ${result.report.total - result.report.failed} จาก ${result.report.total} แถว`}
            {result.report.firstFailure && level.tests.type !== 'cpu'
              ? level.tests.type === 'reference'
                ? ''
                : ` · ดู${level.tests.type === 'sequence' ? 'ขั้น' : 'แถว'}ที่ ${result.report.firstFailure.index + 1}`
              : ''}
          </p>
        ) : null}
        {result && !stale && result.report?.error ? <p className="error with-icon">
            <AlertTriangle size={18} aria-hidden /> {result.report.error.message.th}
          </p> : null}
        {result && !stale && !result.report ? (
          <>
            <p className="error with-icon">
              <XCircle size={18} aria-hidden /> วงจรนี้ยังจำลองไม่ได้
            </p>
            <Diagnostics items={result.diagnostics.filter((d) => d.severity === 'error')} />
          </>
        ) : null}
        {passed ? (
          <div className="pass">
            <p>
              <CheckCircle2 size={18} aria-hidden className="pass-icon" /> <strong>ผ่านด่านแล้ว!</strong> {level.unlocks.map((id) => partName(id, LEVELS)).join(', ')} อยู่ในกล่องชิ้นส่วนของด่านถัดไปแล้ว
            </p>
            {level.tests.type === 'cpu' ? (
              <p className="small with-icon">
                <Cpu size={16} aria-hidden /> CPU ของคุณพร้อมแล้ว: ไปที่แท็บ “คอมพิวเตอร์” เพื่อเขียนโปรแกรม assembly แล้วรันบน CPU ที่ต่อเองจาก NAND
              </p>
            ) : null}
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
                ด่านถัดไป <ArrowRight size={16} aria-hidden />
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
            <Lightbulb size={16} aria-hidden className="hint-icon" /> <span>คำใบ้ {i + 1}: {HINTS_TH[h]}</span>
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
              {report ? (
                <td aria-label={r?.ok ? 'ถูก' : 'ผิด'}>
                  <OkMark ok={!!r?.ok} />
                </td>
              ) : null}
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
                {level.tests.type === 'sequence' && level.tests.clock ? <td>
                    {step.tick ? (
                      <span className="with-icon" aria-label={`เดินนาฬิกา ${step.tick} จังหวะ`}>
                        <Timer size={14} aria-hidden />×{step.tick}
                      </span>
                    ) : (
                      '–'
                    )}
                  </td> : null}
                {outs.map((n) => (
                  <td key={n}>{show(step.expect?.[n])}</td>
                ))}
                {report ? outs.map((n) => <td key={`a${n}`}>{show(r?.actual[n])}</td>) : null}
                {report ? (
                  <td aria-label={r ? (r.ok ? 'ถูก' : 'ผิด') : 'ไม่ได้ตรวจ'}>
                    <OkMark ok={r?.ok} />
                  </td>
                ) : null}
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
  if (level.tests.type !== 'reference' && level.tests.type !== 'rom') return null;
  const rom = level.tests.type === 'rom' ? level.tests : null;
  // ROM: ขา data มาจากแผง ตารางจึงแสดงแค่ addr กับ out
  const ins = rom ? ['addr'] : level.target.pins.filter((p) => p.dir === 'in').map((p) => p.name);
  const outs = rom ? ['out'] : level.target.pins.filter((p) => p.dir === 'out').map((p) => p.name);
  if (!report && rom) {
    return (
      <p className="muted small" data-testid="reference-info">
        ทดสอบโดยใส่ข้อมูลสุ่ม 2 ชุดลงแผงค่าคงที่ แล้วอ่านทุก address รวม {(rom.words * 2).toLocaleString()} ครั้ง
      </p>
    );
  }
  if (!report && level.tests.type === 'reference') {
    const bits = level.target.pins.filter((p) => p.dir === 'in').reduce((n, p) => n + p.width, 0);
    return (
      <p className="muted small" data-testid="reference-info">
        {bits <= 16
          ? `ทดสอบครบทุกกรณี ${(2 ** bits).toLocaleString()} แบบ`
          : `ขาเข้ามี ${(2 ** bits).toLocaleString()} แบบ ลองครบไม่ไหว จึงทดสอบกรณีขอบ (0, ค่ามากสุด, บิตเครื่องหมาย ฯลฯ) + สุ่มอีก ${(level.tests.samples ?? 2000).toLocaleString()} แบบ`}
      </p>
    );
  }
  if (!report) return null;
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
                <td aria-label={r.ok ? 'ถูก' : 'ผิด'}>
                  <OkMark ok={r.ok} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** โปรแกรมตัวอย่างที่ใส่แผงของด่าน CPU ตอนลองเล่น: โปรแกรมทดสอบตัวแรก */
function samplePrograms(level: LevelDef): { words: number[]; listing: string[] } {
  if (level.tests.type !== 'cpu' || !level.tests.programs[0]) return { words: [], listing: [] };
  const words = assemble(level.tests.programs[0].source).words;
  return { words, listing: disassemble(words) };
}

const CPU_PIN_TH: Record<string, string> = { pc: 'PC', a: 'A', b: 'B', c: 'C', d: 'D', sp: 'SP', flags: 'flags (ZCN)', halt: 'halt', out: 'จอ (out)', leds: 'LED', seg: '7-segment' };
const hex2 = (v: SignalValue | undefined): string =>
  typeof v === 'number' ? `${v} · 0x${v.toString(16).toUpperCase().padStart(2, '0')}` : show(v);

function PinCompare({ rows, fail, label }: { rows: string[]; fail: TestCaseResult; label: string }) {
  return (
    <table className="truth-table cpu-pins" aria-label={label}>
      <thead>
        <tr>
          <th scope="col">ขา</th>
          <th scope="col">ที่ต้องได้</th>
          <th scope="col">ที่ได้</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((pin) => {
          const ok = fail.expected[pin] === fail.actual[pin];
          return (
            <tr key={pin} className={ok ? undefined : 'fail'}>
              <td>{CPU_PIN_TH[pin] ?? pin}</td>
              <td className="mono">{hex2(fail.expected[pin])}</td>
              <td className="mono">
                {hex2(fail.actual[pin])} {ok ? null : <OkMark ok={false} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * ด่าน CPU: ก่อนทดสอบแสดงรายชื่อโปรแกรม หลังทดสอบบอกผลทีละโปรแกรม
 * ถ้าผิดบอก cycle และคำสั่งที่เพิ่งทำ แล้วเทียบทุกขาดีบักกับ emulator
 */
function CpuTable({ level, report }: { level: LevelDef; report: TestReport | null }) {
  if (level.tests.type !== 'cpu') return null;
  const programs = level.tests.programs;
  const fail = report?.results.find((r) => !r.ok);
  return (
    <>
      <p className="muted small" data-testid="reference-info">
        ใส่โปรแกรมลงแผง กด reset แล้วเดินนาฬิกา เทียบ PC, register, flags และ I/O กับ emulator ทุก cycle
      </p>
      <ol className="cpu-programs" aria-label="โปรแกรมทดสอบ">
        {programs.map((p, i) => {
          const r = report?.results.find((x) => x.cpu?.program === i);
          return (
            <li key={i} className={r ? (r.ok ? 'ok' : 'fail') : undefined}>
              {report ? (
                <span className="with-icon" aria-label={r ? (r.ok ? 'ผ่าน' : 'ไม่ผ่าน') : 'ไม่ได้รัน'}>
                  {r ? <OkMark ok={r.ok} /> : '–'}{' '}
                </span>
              ) : (
                <ListOrdered size={14} aria-hidden className="muted-icon" />
              )}{' '}
              {p.name.th}
              {r?.ok && r.cpu ? <span className="muted small"> · {r.cpu.cycle} cycle</span> : null}
            </li>
          );
        })}
      </ol>
      {fail?.cpu ? (
        <div className="cpu-fail" data-testid="cpu-failure">
          <p>
            <strong>{programs[fail.cpu.program]?.name.th}</strong> ผิดที่ cycle {fail.cpu.cycle}
            {fail.cpu.instruction !== undefined ? (
              <>
                {' '}หลังทำคำสั่ง <code>{fail.cpu.instruction}</code> ที่ address 0x
                {(fail.cpu.pc ?? 0).toString(16).toUpperCase().padStart(2, '0')}
              </>
            ) : (
              ' (หลัง reset)'
            )}
          </p>
          <PinCompare rows={Object.keys(fail.expected).filter((p) => fail.expected[p] !== fail.actual[p])} fail={fail} label="ขาที่ได้ค่าผิด" />
          <details>
            <summary>ดูทุกขาใน cycle นี้</summary>
            <PinCompare rows={Object.keys(fail.expected)} fail={fail} label="ค่าทุกขาของ CPU" />
          </details>
          <details>
            <summary>ดูซอร์สของโปรแกรมนี้</summary>
            <pre className="asm mono">{programs[fail.cpu.program]?.source}</pre>
          </details>
        </div>
      ) : null}
    </>
  );
}

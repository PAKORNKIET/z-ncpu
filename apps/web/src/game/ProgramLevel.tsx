// ด่านเขียนโปรแกรม (บท 8): เขียน assembly แล้วทดสอบบน CPU ที่ผู้เล่นต่อเองจาก NAND
import { HINTS_TH } from '@z-ncpu/content';
import { assemble } from '@z-ncpu/isa';
import type { LevelDef, ProgramCase, TestCaseResult, TestReport } from '@z-ncpu/shared';
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, FileCode2, Lightbulb, PartyPopper, Play, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { OkMark } from '../ui/icons';
import { AsmEditor } from '../computer/AsmEditor';
import { EngineClosedError } from '../engine-client';
import { useEngine } from '../use-engine';
import { hashText, programOf, putProgram, recordTest, type LevelStatus } from './progress';
import type { SaveFile } from './save';

const STARTER = `; เขียนโปรแกรมของด่านนี้ (ดูโจทย์ในบทเรียนด้านบน)

        HALT
`;

const expectText = (c: ProgramCase): string => {
  const e = c.expect;
  const parts: string[] = [];
  if (e.outs) parts.push(`จอแสดง ${e.outs.join(', ')}`);
  if (e.out !== undefined) parts.push(`จอ = ${e.out}`);
  if (e.leds !== undefined) parts.push(`LED = ${e.leds}`);
  if (e.seg !== undefined) parts.push(`7-segment = ${e.seg}`);
  return parts.join(' · ');
};

const gotText = (c: ProgramCase, r: TestCaseResult): string => {
  const p = r.program;
  const parts: string[] = [];
  if (c.expect.outs) parts.push(`จอแสดง ${p && p.outs.length > 0 ? p.outs.join(', ') : '(ไม่มี)'}`);
  for (const [pin, label] of [['out', 'จอ'], ['leds', 'LED'], ['seg', '7-segment']] as const) {
    if (c.expect[pin] !== undefined) parts.push(`${label} = ${r.actual[pin] ?? 'X'}`);
  }
  return parts.join(' · ');
};

export function ProgramLevel(props: {
  level: LevelDef;
  save: SaveFile;
  setSave: (f: (s: SaveFile) => SaveFile) => void;
  status: LevelStatus;
  next?: (() => void) | undefined;
}) {
  const { level, save, setSave } = props;
  const suite = level.tests.type === 'program' ? level.tests : null;
  const { client } = useEngine();
  const stored = programOf(save, level.id);
  const [source, setSource] = useState(stored ?? STARTER);
  const asm = useMemo(() => assemble(source), [source]);
  const [state, setState] = useState<{ k: 'idle' } | { k: 'running' } | { k: 'done'; report: TestReport | null; error?: string; hash: string }>({
    k: 'idle',
  });
  const [hints, setHints] = useState(0);
  const [copied, setCopied] = useState(false);
  const cpu = save.components.some((c) => c.id === suite?.cpu);

  // บันทึกโปรแกรมของด่านนี้ (หน่วงไว้ ไม่บันทึกทุกตัวอักษร)
  useEffect(() => {
    if (source === stored) return;
    const t = setTimeout(() => setSave((s) => putProgram(s, level.id, source)), 500);
    return () => clearTimeout(t);
  }, [source, stored, level.id, setSave]);

  // วงจรทั้งหมดของผู้เล่น (CPU และทุกชิ้นข้างใน) ให้ worker ใช้ตอนทดสอบ
  useEffect(() => {
    if (client) client.post({ type: 'load', components: save.components });
  }, [client, save.components]);

  if (!suite) return null;

  const run = async (): Promise<void> => {
    if (!client || !asm.ok) return;
    const tested = source;
    setState({ k: 'running' });
    try {
      const res = await client.send({ type: 'test', defId: suite.cpu, tests: { ...suite, words: asm.words }, mode: 'fast' });
      if (res.type !== 'testResult') return;
      const error = res.report?.error?.message.th ?? res.diagnostics.find((d) => d.severity === 'error')?.message.th;
      setState({ k: 'done', report: res.report, hash: hashText(tested), ...(error ? { error } : {}) });
      const passed = !!res.report?.passed;
      setSave((s) => recordTest(putProgram(s, level.id, tested), level.id, { passed, hash: hashText(tested), nand: asm.words.length }));
    } catch (e) {
      if (!(e instanceof EngineClosedError)) console.error(e);
    }
  };

  const result = state.k === 'done' ? state : null;
  const stale = result !== null && result.hash !== hashText(source);
  const report = result && !stale ? result.report : null;
  const passed = !!report?.passed;
  const best = save.progress[level.id]?.bestNand;

  return (
    <div className="program-level">
      <section className="program-editor" aria-labelledby="prog-title">
        <h2 id="prog-title" className="with-icon">
          <FileCode2 size={18} aria-hidden /> โปรแกรมของคุณ
        </h2>
        <AsmEditor source={source} onChange={setSource} asm={asm} height={360} />
        <div className="row">
          <button className="primary" onClick={() => void run()} disabled={!client || !cpu || !asm.ok || state.k === 'running'}>
            {state.k === 'running' ? (
              'กำลังรันบน CPU ของคุณ…'
            ) : (
              <>
                <Play size={16} aria-hidden />
                ทดสอบบน CPU ของฉัน
              </>
            )}
          </button>
          <button
            onClick={() => {
              setSave((s) => putProgram(s, 'main', source));
              setCopied(true);
            }}
          >
            <Copy size={16} aria-hidden />
            คัดลอกไปหน้าคอมพิวเตอร์
          </button>
        </div>
        {copied ? <p className="small muted">คัดลอกแล้ว: เปิดแท็บ “คอมพิวเตอร์” เพื่อรันทีละคำสั่ง ดู register และย้อนเวลาได้</p> : null}
        {!cpu ? <p className="error small">ยังไม่มี CPU: ผ่านด่าน “ประกอบ CPU Z8” ก่อน</p> : null}
      </section>

      <section className="test-panel" aria-labelledby="test-title">
        <h2 id="test-title">ทดสอบ</h2>
        <p className="muted small" data-testid="level-status">
          สถานะ: {{ locked: 'ล็อก', open: 'ยังไม่ผ่าน', passed: 'ผ่านแล้ว', retest: 'แก้โปรแกรมแล้ว ต้องทดสอบใหม่' }[props.status]}
          {best !== undefined && props.status !== 'open' ? ` · ดีที่สุด ${best} คำสั่ง` : ''}
        </p>
        <p className="muted small">
          เกมรันโปรแกรมบน CPU ที่คุณต่อเองจาก NAND จนถึง HALT {suite.cases.length > 1 ? `ทั้ง ${suite.cases.length} กรณี ` : ''}แล้วดูว่าจอและไฟแสดงตามโจทย์ไหม
        </p>
        <div className="table-scroll">
          <table className="truth-table" aria-label="กรณีทดสอบ">
            <thead>
              <tr>
                <th scope="col">กรณี</th>
                <th scope="col">ต้องได้</th>
                {report ? <th scope="col">ได้จริง</th> : null}
                {report ? <th scope="col">ผล</th> : null}
              </tr>
            </thead>
            <tbody>
              {suite.cases.map((c, i) => {
                const r = report?.results[i];
                return (
                  <tr key={i} className={r ? (r.ok ? 'ok' : 'fail') : undefined}>
                    <td className="left">{c.name.th}</td>
                    <td className="left">{expectText(c)}</td>
                    {report ? <td className="left">{r ? gotText(c, r) : ''}</td> : null}
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

        <div role="status" aria-live="polite" className="test-result">
          {stale ? <p className="muted">โปรแกรมเปลี่ยนแล้ว กดทดสอบอีกครั้ง</p> : null}
          {result && !stale && result.error ? <p className="error with-icon">
              <AlertTriangle size={18} aria-hidden /> {result.error}
            </p> : null}
          {report && !passed
            ? report.results
                .filter((r) => !r.ok)
                .slice(0, 1)
                .map((r) => (
                  <div key={r.index} className="error">
                    <p className="with-icon">
                      <XCircle size={18} aria-hidden /> ยังไม่ผ่าน: กรณี “{suite.cases[r.index]?.name.th}”</p>
                    {!r.program?.halted ? (
                      <p className="small">ไม่ถึง HALT ภายใน {suite.cases[r.index]?.maxCycles} cycle (วนไม่จบ หรือลืม HALT หรือเปล่า?)</p>
                    ) : null}
                    {r.program?.emulatorPassed ? (
                      <p className="small">
                        <Lightbulb size={14} aria-hidden /> โปรแกรมนี้ถูกต้องบน emulator แต่ CPU ที่คุณต่อให้ผลต่างออกไป ลองกลับไปทดสอบด่าน “ประกอบ CPU Z8” อีกครั้ง
                      </p>
                    ) : null}
                  </div>
                ))
            : null}
          {passed ? (
            <div className="pass">
              <p>
                <CheckCircle2 size={18} aria-hidden className="pass-icon" /> <strong>ผ่านด่านแล้ว!</strong> โปรแกรม {asm.words.length} คำสั่ง รันบน CPU ที่คุณต่อเองจาก NAND
              </p>
              {props.next ? (
                <button className="primary" onClick={props.next}>
                  ด่านถัดไป <ArrowRight size={16} aria-hidden />
                </button>
              ) : (
                <p className="small muted">ผ่านครบทุกด่านที่มีตอนนี้แล้ว <PartyPopper size={14} aria-hidden />
                </p>
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
    </div>
  );
}

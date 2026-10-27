// หน้าคอมพิวเตอร์ (Spec ส่วน 9, 10, 12): เขียน assembly แล้วรันบน CPU ที่ผู้เล่นต่อเองจาก NAND
// assembler ใส่รหัสเครื่องลงแผงค่าคงที่ที่ต่อเข้าขา prog แล้วเดินนาฬิกาจริงใน Worker
// ค่า register อ่านจากขาดีบักของ CPU ไม่ได้มาจาก emulator
import { EXAMPLE_PROGRAMS } from '@z-ncpu/content';
import { ComponentLibrary, contentHash, cpuHarness, ROM_DUT, ROM_PANEL } from '@z-ncpu/engine';
import { assemble, explainInstruction, extendIsa, hex16, Z8, Z8_PLUS_DEFAULT, type AsmResult } from '@z-ncpu/isa';
import type { CpuSuite, SignalValue, TestReport } from '@z-ncpu/shared';
import { AlertTriangle, Box, BookOpen, CheckCircle2, Upload, CircleDot, Cpu, FileCode2, ListOrdered, Pause, Play, RotateCcw, ScanSearch, StepForward, X, XCircle } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { EngineClosedError } from '../engine-client';
import type { SaveFile } from '../game/save';
import { useEngine } from '../use-engine';
import { LedBar, NumberDisplay, SevenSegment } from '../ui/devices';
import { BusInput } from '../ui/widgets';
import { AsmEditor } from './AsmEditor';
import { keyCode, typedKey } from './keys';
import { TutorPanel } from '../tutor/TutorPanel';
import { programSummary, reportSummary } from '../tutor/tutor';
import { LogicAnalyzer } from './LogicAnalyzer';

// three.js ใหญ่ โหลดเฉพาะตอนเปิดมุมมอง 3D
const View3D = lazy(() => import('./View3D'));

const CPU_ID = 'user.cpu';
/** CPU ที่ผู้เล่นเพิ่มคำสั่งเอง (ด่านโบนัสของบท 9) ใช้ ISA ของฉัน */
const CPU_PLUS_ID = 'user.cpuplus';
const PROGRAM_ID = 'main';
/** จำนวน cycle ที่เทียบกับ emulator (CPU 55,000 NAND เดินได้ราวหลายร้อย cycle ต่อวินาที) */
const VERIFY_CYCLES = 500;
const SPEEDS: [number, string][] = [
  [1, '1 Hz'],
  [4, '4 Hz'],
  [10, '10 Hz'],
  [50, '50 Hz'],
  [200, '200 Hz'],
  [Infinity, 'เร็วที่สุด'],
];

const hex2 = (v: number): string => v.toString(16).toUpperCase().padStart(2, '0');
const num = (v: SignalValue | undefined): number | undefined => (typeof v === 'number' ? v : undefined);

export function ComputerPage({ save, setSave }: { save: SaveFile; setSave: Dispatch<SetStateAction<SaveFile>> }) {
  const cpu = save.components.find((c) => c.id === CPU_ID);
  if (!cpu) {
    return (
      <section className="computer empty" aria-label="คอมพิวเตอร์">
        <Cpu size={48} aria-hidden className="empty-icon" />
        <h2>คอมพิวเตอร์ของฉัน</h2>
        <p>ยังไม่มี CPU ให้รันโปรแกรม: ผ่านด่าน “ประกอบ CPU Z8” ในบทที่ 7 ก่อน แล้วกลับมาเขียนโปรแกรมให้ CPU ที่ต่อเองได้ที่นี่</p>
      </section>
    );
  }
  return <Computer save={save} setSave={setSave} />;
}

type Verify = { k: 'running' } | { k: 'done'; report: TestReport | null; error?: string; source: string; cpuId: string };

function Computer({ save, setSave }: { save: SaveFile; setSave: Dispatch<SetStateAction<SaveFile>> }) {
  const { client, pins, cycle, running, stopReason, history } = useEngine();
  const storedProgram = save.programs.find((p) => p.id === PROGRAM_ID);
  const stored = storedProgram?.source;
  const hasPlus = save.components.some((c) => c.id === CPU_PLUS_ID);
  // CPU ที่เลือก: โปรแกรมที่บันทึกไว้บอกว่าเขียนให้ Z8 หรือ Z8+
  const [cpuId, setCpuId] = useState(hasPlus && storedProgram?.isa === 'Z8+' ? CPU_PLUS_ID : CPU_ID);
  const plus = cpuId === CPU_PLUS_ID;
  const ext = save.isa ?? Z8_PLUS_DEFAULT;
  const isa = useMemo(() => (plus ? extendIsa(ext) : Z8), [plus, ext]);
  const [source, setSource] = useState(stored ?? EXAMPLE_PROGRAMS[0]!.source);
  const asm = useMemo(() => assemble(source, isa), [source, isa]);
  const [verify, setVerify] = useState<Verify | null>(null);
  /** โปรแกรมที่อยู่ในแผงตอนนี้ */
  const [loaded, setLoaded] = useState<{ source: string; asm: AsmResult } | null>(null);
  const [hz, setHz] = useState(EXAMPLE_PROGRAMS[0]!.hz);
  const [ready, setReady] = useState<{ gates: number } | { error: string } | null>(null);
  const [inputs, setInputs] = useState({ sw: 0, btn: 0, key: 0 });
  const [breakpoints, setBreakpoints] = useState<string[]>([]);
  const [bpDraft, setBpDraft] = useState('');
  const [bpError, setBpError] = useState<string | null>(null);
  const listingRef = useRef<HTMLDivElement>(null);
  const [show3d, setShow3d] = useState(false);

  const levelPassed = !!save.progress[plus ? 'adv.shr' : 'cpu.z8']?.passedHash;
  const lib = useMemo(() => new ComponentLibrary(save.components), [save.components]);
  // compile ใหม่เฉพาะเมื่อวงจรของ CPU เปลี่ยนจริง (ไม่นับตำแหน่ง) หรือเปลี่ยน CPU ไม่ใช่ทุกครั้งที่ save เปลี่ยน
  const cpuKey = useMemo(() => `${cpuId}:${contentHash(lib, cpuId)}`, [lib, cpuId]);

  // บันทึกโปรแกรมลง save (หน่วงไว้ ไม่บันทึกทุกตัวอักษร)
  useEffect(() => {
    const isaName = plus ? 'Z8+' : 'Z8';
    if (source === stored && (storedProgram?.isa ?? 'Z8') === isaName) return;
    const t = setTimeout(() => {
      setSave((s) => ({
        ...s,
        programs: [...s.programs.filter((p) => p.id !== PROGRAM_ID), { id: PROGRAM_ID, isa: isaName, source }],
      }));
    }, 500);
    return () => clearTimeout(t);
  }, [source, stored, storedProgram?.isa, plus, setSave]);

  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  // โปรแกรมล่าสุดในตัวแก้ (ใช้ตอน compile CPU ครั้งแรกหรือหลังเปลี่ยน CPU)
  const asmRef = useRef(asm);
  asmRef.current = asm;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // compile CPU ของผู้เล่นในวงจรห่อ (แผงโปรแกรม → prog) แล้วโหลดโปรแกรมและ reset
  useEffect(() => {
    if (!client) return;
    let active = true;
    const harness = cpuHarness(lib, cpuId);
    if ('code' in harness) {
      setReady({ error: harness.message.th });
      return;
    }
    setReady(null);
    client.post({ type: 'load', components: [...lib.all(), harness] });
    client
      .send({ type: 'compile', defId: harness.id, mode: 'fast' })
      .then((res) => {
        if (!active || res.type !== 'compiled') return;
        const errors = res.diagnostics.filter((d) => d.severity === 'error');
        if (!res.stats || errors.length > 0) {
          setReady({ error: errors[0]?.message.th ?? 'compile CPU ไม่ผ่าน' });
          return;
        }
        setReady({ gates: res.stats.gates });
        const prog = loadedRef.current ?? (asmRef.current.ok ? { source: sourceRef.current, asm: asmRef.current } : null);
        if (prog) {
          client.post({ type: 'loadPanel', panel: ROM_PANEL, words: prog.asm.words });
          if (!loadedRef.current) setLoaded(prog);
        }
        for (const [pin, value] of Object.entries(inputsRef.current)) client.post({ type: 'setInput', pin, value });
        client.post({ type: 'resetCpu' });
      })
      .catch((e: unknown) => {
        if (!(e instanceof EngineClosedError)) console.error(e);
      });
    return () => {
      active = false;
    };
    // source ตอนเริ่มอ่านผ่าน ref/state ไม่ต้อง compile ใหม่เมื่อแก้โปรแกรม
  }, [client, cpuKey]);

  // breakpoint ทั้งหมดรวมเป็นเงื่อนไขเดียวด้วย ||
  useEffect(() => {
    if (!client || !ready || !('gates' in ready)) return;
    const expr = breakpoints.length === 0 ? null : breakpoints.map((b) => `(${b})`).join(' || ');
    client.post({ type: 'breakpoint', expr, scopePrefix: ROM_DUT });
  }, [client, ready, breakpoints]);

  const ok = !!ready && 'gates' in ready;
  const pc = num(pins.pc);
  const halted = pins.halt === 1;
  const dirty = loaded !== null && loaded.source !== source;

  // เลื่อนรายการคำสั่งให้เห็นบรรทัดที่ PC ชี้ (เลื่อนเฉพาะกล่อง ไม่เลื่อนทั้งหน้า)
  useEffect(() => {
    const box = listingRef.current;
    const row = box?.querySelector<HTMLElement>('tr[aria-current]');
    if (!box || !row) return;
    if (row.offsetTop < box.scrollTop + 30 || row.offsetTop > box.scrollTop + box.clientHeight - 30) {
      box.scrollTop = row.offsetTop - box.clientHeight / 2;
    }
  }, [pc]);

  /** เปลี่ยน CPU: รหัสเครื่องเดิมอาจมีคำสั่งที่ CPU ใหม่ไม่รู้จัก จึงล้างแผงแล้วโหลดโปรแกรมใหม่หลัง compile */
  const switchCpu = (next: string): void => {
    if (next === cpuId) return;
    client?.post({ type: 'pause' });
    setLoaded(null);
    setVerify(null);
    setCpuId(next);
  };

  /** รันโปรแกรมเดียวกันบน CPU (วงจร NAND) และบน emulator ที่ทำตามสูตรของ ISA แล้วเทียบทุกขาทุก cycle */
  const verifyProgram = async (): Promise<void> => {
    if (!client || !asm.ok) return;
    client.post({ type: 'pause' });
    setVerify({ k: 'running' });
    const tests: CpuSuite = {
      type: 'cpu',
      programs: [{ name: { th: 'โปรแกรมของฉัน', en: 'My program' }, source, maxCycles: VERIFY_CYCLES, inputs }],
      ...(plus ? { isa: ext } : {}),
    };
    try {
      const res = await client.send({ type: 'test', defId: cpuId, tests, mode: 'fast' });
      if (res.type !== 'testResult') return;
      const error = res.report?.error?.message.th ?? (res.report ? undefined : (res.diagnostics[0]?.message.th ?? 'ตรวจไม่ได้'));
      setVerify({ k: 'done', report: res.report, source, cpuId, ...(error ? { error } : {}) });
    } catch (e) {
      if (!(e instanceof EngineClosedError)) console.error(e);
    }
  };

  const loadProgram = (): void => {
    if (!client || !asm.ok) return;
    client.post({ type: 'pause' });
    client.post({ type: 'loadPanel', panel: ROM_PANEL, words: asm.words });
    client.post({ type: 'resetCpu' });
    setLoaded({ source, asm });
  };
  const setInput = (pin: 'sw' | 'btn' | 'key', value: number): void => {
    setInputs((s) => ({ ...s, [pin]: value }));
    client?.post({ type: 'setInput', pin, value });
  };
  const run = (): void => {
    if (!client) return;
    if (running) client.post({ type: 'pause' });
    else client.post({ type: 'run', hz });
  };
  const changeSpeed = (next: number): void => {
    setHz(next);
    if (running) client?.post({ type: 'run', hz: next });
  };
  const toggleBreakAt = (addr: number): void => {
    const cond = `PC == 0x${hex2(addr)}`;
    setBreakpoints((list) => (list.includes(cond) ? list.filter((b) => b !== cond) : [...list, cond]));
  };
  const addBreakpoint = async (): Promise<void> => {
    const text = bpDraft.trim();
    if (!client || !text) return;
    // ตรวจเงื่อนไขใหม่ตัวเดียวก่อน จะได้บอกคอลัมน์ที่ผิดได้ตรง แล้ว effect ด้านบนจะตั้งชุดรวมให้
    const res = await client.send({ type: 'breakpoint', expr: text, scopePrefix: ROM_DUT });
    if (res.type !== 'breakpointSet') return;
    if (!res.ok) {
      setBpError(`คอลัมน์ ${res.error?.col}: ${res.error?.message.th}`);
      setBreakpoints((b) => [...b]);
      return;
    }
    setBpError(null);
    setBpDraft('');
    setBreakpoints((b) => (b.includes(text) ? [...b] : [...b, text]));
  };
  const shown = loaded?.asm ?? null;
  const sourceLines = (loaded?.source ?? source).split('\n');
  const registers: [string, string, SignalValue | undefined][] = [
    ['PC', 'pc', pins.pc],
    ['A', 'a', pins.a],
    ['B', 'b', pins.b],
    ['C', 'c', pins.c],
    ['D', 'd', pins.d],
    ['SP', 'sp', pins.sp],
  ];
  const flags = num(pins.flags);
  const regValues = [pins.pc, pins.a, pins.b, pins.c, pins.d, pins.sp, pins.flags].map(num);
  const explain =
    pc !== undefined && regValues.every((v) => v !== undefined) && loaded
      ? halted
        ? 'HALT: CPU หยุดแล้ว กด Reset เพื่อเริ่มใหม่'
        : explainInstruction(
            loaded.asm.words[pc] ?? 0,
            {
            pc,
            a: regValues[1]!,
            b: regValues[2]!,
            c: regValues[3]!,
            d: regValues[4]!,
            sp: regValues[5]!,
            flags: regValues[6]!,
            },
            isa,
          )
      : null;

  return (
    <div className="computer">
      <section className="computer-editor" aria-labelledby="asm-title">
        <div className="computer-head">
          <h2 id="asm-title" className="with-icon">
            <FileCode2 size={18} aria-hidden /> โปรแกรม (assembly)
          </h2>
          <label className="small">
            ตัวอย่าง{' '}
            <select
              aria-label="โปรแกรมตัวอย่าง"
              value=""
              onChange={(e) => {
                const ex = EXAMPLE_PROGRAMS.find((p) => p.id === e.target.value);
                if (!ex) return;
                if (source !== ex.source && dirty && !window.confirm('แทนที่โปรแกรมที่แก้อยู่ด้วยตัวอย่างนี้?')) return;
                setSource(ex.source);
                changeSpeed(ex.hz);
              }}
            >
              <option value="">เลือก…</option>
              {EXAMPLE_PROGRAMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.th}
                </option>
              ))}
            </select>
          </label>
        </div>
        <AsmEditor source={source} onChange={setSource} asm={asm} status={dirty ? ' · ยังไม่ได้โหลดลง CPU' : ''} />
        <button className="primary" onClick={loadProgram} disabled={!ok || !asm.ok}>
          <Upload size={16} aria-hidden />
          โหลดลง CPU แล้ว reset
        </button>
        <TutorPanel
          context={() => ({
            place: `หน้าคอมพิวเตอร์ (เขียนโปรแกรมอิสระ) บน CPU ${plus ? 'Z8+' : 'Z8'} ที่ผู้เล่นต่อเองจาก NAND`,
            goal: plus
              ? `ไม่มีโจทย์ตายตัว CPU นี้มีคำสั่งเพิ่มจาก Z8: ${isa.instructions
                  .filter((d) => d.group === 3)
                  .map((d) => `${d.mnemonic} ${d.operands.join(', ')} (${d.semantics ?? ''})`)
                  .join('; ')}`
              : 'ไม่มีโจทย์ตายตัว ผู้เล่นทดลองเขียนโปรแกรม assembly ของ Z8',
            work: programSummary(source, asm.diagnostics),
            result: [
              `ตอนนี้: cycle ${cycle}${halted ? ' หยุดที่ HALT' : ''} · PC=${String(pins.pc)} A=${String(pins.a)} B=${String(pins.b)} C=${String(pins.c)} D=${String(pins.d)} SP=${String(pins.sp)} flags(ZCN)=${String(pins.flags)} จอ=${String(pins.out ?? '-')}`,
              verify?.k === 'done' && verify.source === source ? `เทียบกับ emulator: ${verify.error ?? reportSummary(verify.report)}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          })}
        />
      </section>

      <section className="computer-run" aria-labelledby="run-title">
        <div className="computer-head">
          <h2 id="run-title" className="with-icon">
            <Cpu size={18} aria-hidden /> CPU ของฉัน
          </h2>
          {hasPlus ? (
            <label className="small">
              CPU{' '}
              <select aria-label="เลือก CPU" value={cpuId} onChange={(e) => switchCpu(e.target.value)}>
                <option value={CPU_ID}>Z8 (บทที่ 7)</option>
                <option value={CPU_PLUS_ID}>Z8+ (ISA ของฉัน)</option>
              </select>
            </label>
          ) : null}
        </div>
        {plus ? (
          <p className="muted small" data-testid="isa-info">
            ISA: Z8 + {extendIsa(ext).instructions.filter((d) => d.group === 3).map((d) => d.mnemonic).join(', ') || '(ยังไม่มีคำสั่งเพิ่ม)'} · แก้ได้ที่ “สนามทดลอง” ส่วน ISA ของฉัน
          </p>
        ) : null}
        {ready === null ? <p className="muted">กำลังเตรียม CPU (compile วงจร NAND)…</p> : null}
        {ready && 'error' in ready ? <p className="error with-icon">
            <AlertTriangle size={16} aria-hidden /> CPU ยังรันไม่ได้: {ready.error}
          </p> : null}
        {ok ? (
          <p className="muted small">
            <span data-testid="cpu-gates">{ready.gates.toLocaleString()}</span> NAND
            {levelPassed ? ' · ผ่านการทดสอบแล้ว' : plus ? ' · ยังไม่ผ่านด่านโบนัส Z8+ ผลอาจไม่ตรงกับที่โปรแกรมควรทำ' : ' · ยังไม่ผ่านด่าน CPU ผลอาจไม่ตรงกับที่โปรแกรมควรทำ'}
          </p>
        ) : null}

        <div className="run-controls" role="toolbar" aria-label="ควบคุม CPU">
          <button onClick={() => client?.post({ type: 'resetCpu' })} disabled={!ok}>
            <RotateCcw size={16} aria-hidden />
            Reset
          </button>
          <button className="primary" onClick={run} disabled={!ok || (halted && !running)}>
            {running ? (
              <>
                <Pause size={16} aria-hidden />
                หยุด
              </>
            ) : (
              <>
                <Play size={16} aria-hidden />
                รัน
              </>
            )}
          </button>
          <button onClick={() => client?.post({ type: 'step', count: 1 })} disabled={!ok || running}>
            <StepForward size={16} aria-hidden />
            ทีละคำสั่ง
          </button>
          <label className="small">
            ความเร็ว{' '}
            <select aria-label="ความเร็ว" value={String(hz)} onChange={(e) => changeSpeed(Number(e.target.value))}>
              {SPEEDS.map(([v, label]) => (
                <option key={label} value={String(v)}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="run-state small" role="status" aria-live="polite" data-testid="run-state">
          cycle <span className="mono">{cycle}</span>
          {running ? ' · กำลังรัน' : halted ? ' · หยุดที่ HALT (กด Reset เพื่อเริ่มใหม่)' : stopReason === 'breakpoint' ? ' · หยุดที่ breakpoint' : ' · หยุดอยู่'}
        </p>

        <div className="devices-row">
          <NumberDisplay label="จอ (0xF0)" value={pins.out} width={8} />
          <SevenSegment label="7-segment (0xF2)" value={pins.seg} />
          <LedBar label="LED (0xF1)" value={pins.leds} width={8} />
        </div>

        <div className="verify">
          <button onClick={() => void verifyProgram()} disabled={!ok || !asm.ok || verify?.k === 'running'}>
            <ScanSearch size={16} aria-hidden />
            {verify?.k === 'running' ? 'กำลังเทียบ…' : 'เทียบกับ emulator'}
          </button>
          <span className="muted small">รันโปรแกรมในตัวแก้ ({VERIFY_CYCLES} cycle แรก) บน CPU ของคุณกับ emulator แล้วเทียบทุก register ทุก cycle</span>
          <VerifyResult verify={verify} stale={verify?.k === 'done' && (verify.source !== source || verify.cpuId !== cpuId)} />
        </div>

        {explain ? (
          <p className="explain small" data-testid="explain">
            <BookOpen size={14} aria-hidden /> คำสั่งถัดไป: <span className="mono">{explain}</span>
          </p>
        ) : null}

        <table className="truth-table registers" aria-label="register">
          <thead>
            <tr>
              <th scope="col">register</th>
              <th scope="col">ฐานสิบ</th>
              <th scope="col">ฐานสิบหก</th>
            </tr>
          </thead>
          <tbody>
            {registers.map(([label, key, v]) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td className="mono" data-testid={`reg-${key}`}>
                  {typeof v === 'number' ? v : 'X'}
                </td>
                <td className="mono">{typeof v === 'number' ? `0x${hex2(v)}` : '–'}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">flags</th>
              <td className="mono" colSpan={2} data-testid="reg-flags">
                {flags === undefined ? 'X' : `Z=${(flags >> 2) & 1} C=${(flags >> 1) & 1} N=${flags & 1}`}
              </td>
            </tr>
          </tbody>
        </table>

        <fieldset className="cpu-inputs">
          <legend>อุปกรณ์ขาเข้า</legend>
          <BusInput label="สวิตช์ (0xF8)" width={8} value={inputs.sw} onChange={(v) => setInput('sw', v)} />
          <div className="push-buttons" aria-label="ปุ่มกด (0xF9)" role="group">
            <span className="small">ปุ่มกด (0xF9):</span>
            {[0, 1, 2, 3].map((b) => (
              <button
                key={b}
                className={(inputs.btn >> b) & 1 ? 'on' : undefined}
                aria-pressed={((inputs.btn >> b) & 1) === 1}
                aria-label={`ปุ่ม ${b}`}
                onPointerDown={() => setInput('btn', inputs.btn | (1 << b))}
                onPointerUp={() => setInput('btn', inputsRef.current.btn & ~(1 << b))}
                onPointerLeave={() => {
                  if ((inputsRef.current.btn >> b) & 1) setInput('btn', inputsRef.current.btn & ~(1 << b));
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') setInput('btn', inputsRef.current.btn | (1 << b));
                }}
                onKeyUp={() => setInput('btn', inputsRef.current.btn & ~(1 << b))}
              >
                {b}
              </button>
            ))}
          </div>
          <label className="small key-input">
            คีย์บอร์ด (0xFA):{' '}
            <input
              aria-label="คีย์บอร์ด: คลิกแล้วกดปุ่ม"
              placeholder="คลิกแล้วกดปุ่ม"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="enter"
              value={inputs.key ? `${inputs.key >= 32 && inputs.key < 127 ? `'${String.fromCharCode(inputs.key)}' ` : ''}= ${inputs.key}` : ''}
              onKeyDown={(e) => {
                const code = keyCode(e);
                if (code === undefined || e.key === 'Tab') return;
                e.preventDefault();
                setInput('key', code);
              }}
              // แป้นพิมพ์บนจอมือถือ/แท็บเล็ตมักไม่บอกว่ากดปุ่มอะไรใน keydown (key = "Unidentified")
              // จึงอ่านตัวที่พิมพ์จากเหตุการณ์ input แทน (ช่องไม่ใช่ readOnly ไม่งั้นแป้นพิมพ์บนจอจะไม่ขึ้น)
              onInput={(e) => {
                const code = typedKey(e.nativeEvent as InputEvent);
                if (code !== undefined) setInput('key', code);
              }}
              onChange={() => undefined}
            />
          </label>
        </fieldset>
      </section>

      <section className="computer-listing" aria-labelledby="listing-title">
        <h2 id="listing-title" className="with-icon">
          <ListOrdered size={18} aria-hidden /> ในแผงโปรแกรม
        </h2>
        <p className="muted small">คลิกจุดหน้าบรรทัดเพื่อตั้ง breakpoint · แถวที่ไฮไลต์คือคำสั่งที่ PC ชี้ (จะทำในจังหวะถัดไป)</p>
        <div className="listing-scroll" ref={listingRef}>
          <table className="truth-table program" aria-label="คำสั่งในแผงโปรแกรม">
            <tbody>
              {(shown?.words ?? []).map((w, i) => {
                const bp = breakpoints.includes(`PC == 0x${hex2(i)}`);
                return (
                  <tr key={i} className={i === pc ? 'current' : undefined} aria-current={i === pc ? 'true' : undefined}>
                    <td>
                      <button
                        className={`bp-dot ${bp ? 'on' : ''}`}
                        aria-pressed={bp}
                        aria-label={`breakpoint ที่ 0x${hex2(i)}`}
                        onClick={() => toggleBreakAt(i)}
                      />
                    </td>
                    <td className="mono">{hex2(i)}</td>
                    <td className="mono muted">{hex16(w)}</td>
                    <td className="left mono asm-line">{sourceLines[(shown?.lineOf[i] ?? 1) - 1]?.replace(/\s*;.*$/, '').trim()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pc !== undefined && shown && pc >= shown.words.length ? <p className="muted small mono">PC = 0x{hex2(pc)} (NOP)</p> : null}
        </div>

        <div className="breakpoints">
          <h3 className="with-icon">
            <CircleDot size={16} aria-hidden className="bp-icon" /> Breakpoint
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addBreakpoint();
            }}
          >
            <input
              aria-label="เงื่อนไข breakpoint"
              className="mono"
              placeholder='เช่น A == 5 && Z == 1 หรือ net("alu1.c") == 1'
              value={bpDraft}
              onChange={(e) => setBpDraft(e.target.value)}
            />
            <button type="submit" disabled={!ok || !bpDraft.trim()}>
              เพิ่ม
            </button>
          </form>
          {bpError ? (
            <p className="error small" role="alert">
              {bpError}
            </p>
          ) : null}
          <p className="muted small">ใช้ได้: PC A B C D SP, flags Z N CF (ตัวทด ใช้ CF เพราะ C คือ register), OUT LEDS SEG HALT CYCLE, == != &lt; &gt; &lt;= &gt;= &amp;&amp; || และ net("ชิ้น.ขา")</p>
          <ul aria-label="breakpoint ที่ตั้งไว้">
            {breakpoints.map((b) => (
              <li key={b}>
                <code>{b}</code>{' '}
                <button className="linklike" aria-label={`ลบ breakpoint ${b}`} onClick={() => setBreakpoints((l) => l.filter((x) => x !== b))}>
                  <X size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="computer-3d" aria-labelledby="v3d-title">
        <div className="computer-head">
          <h2 id="v3d-title" className="with-icon">
            <Box size={18} aria-hidden /> มุมมอง 3D
          </h2>
          <button onClick={() => setShow3d((v) => !v)} aria-expanded={show3d} disabled={!ok}>
            {show3d ? 'ปิดมุมมอง 3D' : 'เปิดมุมมอง 3D'}
          </button>
        </div>
        {show3d && ok && client ? (
          <Suspense fallback={<p className="muted small">กำลังโหลดมุมมอง 3D…</p>}>
            <View3D client={client} components={save.components} cpuDefId={cpuId} root={ROM_DUT} version={cpuKey} />
          </Suspense>
        ) : (
          <p className="muted small">ดู CPU ทั้งเครื่องเป็นชั้นๆ ซูมจากภาพรวมเข้าไปจนเห็น NAND ทุกตัว และเห็นไฟวิ่งตอนรันโปรแกรม</p>
        )}
      </section>

      <LogicAnalyzer client={ok ? client : null} history={history} cycle={cycle} running={running} onStep={() => client?.post({ type: 'step', count: 1 })} />
    </div>
  );
}

const PIN_TH: Record<string, string> = { pc: 'PC', a: 'A', b: 'B', c: 'C', d: 'D', sp: 'SP', flags: 'flags', halt: 'halt', out: 'จอ', leds: 'LED', seg: '7-segment' };
const showValue = (v: SignalValue | undefined): string => (typeof v === 'number' ? `${v} (0x${hex2(v)})` : String(v ?? '–'));

function VerifyResult({ verify, stale }: { verify: Verify | null; stale: boolean }) {
  if (!verify || verify.k === 'running') return null;
  return (
    <div role="status" aria-live="polite" className="verify-result small" data-testid="verify-result">
      {stale ? <p className="muted">โปรแกรมหรือ CPU เปลี่ยนแล้ว กดเทียบอีกครั้ง</p> : null}
      {verify.error ? (
        <p className="error with-icon">
          <AlertTriangle size={16} aria-hidden /> {verify.error}
        </p>
      ) : verify.report?.passed ? (
        <p className="with-icon">
          <CheckCircle2 size={16} aria-hidden className="pass-icon" /> ตรงกับ emulator ทุก cycle ({verify.report.results[0]?.cpu?.cycle ?? 0} cycle)
        </p>
      ) : verify.report?.firstFailure?.cpu ? (
        (() => {
          const f = verify.report.firstFailure;
          const cpu = f.cpu!;
          const wrong = Object.keys(f.expected).filter((p) => f.expected[p] !== f.actual[p]);
          return (
            <>
              <p className="error with-icon">
                <XCircle size={16} aria-hidden /> ไม่ตรงที่ cycle {cpu.cycle}
                {cpu.instruction !== undefined ? (
                  <>
                    {' '}หลังคำสั่ง <code>{cpu.instruction}</code> ที่ 0x{hex2(cpu.pc ?? 0)}
                  </>
                ) : (
                  ' (หลัง reset)'
                )}
              </p>
              <ul className="verify-pins">
                {wrong.map((p) => (
                  <li key={p} className="mono">
                    {PIN_TH[p] ?? p}: CPU ได้ {showValue(f.actual[p])} แต่ emulator ได้ {showValue(f.expected[p])}
                  </li>
                ))}
              </ul>
            </>
          );
        })()
      ) : null}
    </div>
  );
}

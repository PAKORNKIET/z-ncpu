import type {
  ComponentDef,
  CpuOracle,
  CpuSnapshot,
  CpuSuite,
  ProgramCase,
  ProgramSuite,
  Diagnostic,
  RomSuite,
  SequenceSuite,
  SignalValue,
  SimMode,
  TestCaseResult,
  TestReport,
  TestSuite,
  TruthTableRow,
  TruthTableSuite,
} from '@z-ncpu/shared';
import { err, hasErrors } from './diag';
import { compile, type CompileOptions } from './flatten';
import { ComponentLibrary } from './library';
import type { SettleResult, Simulator } from './sim/base';
import { createSimulator } from './sim/create';
import { referenceRows } from './references';

export { MAX_EXHAUSTIVE_BITS, exhaustiveRows } from './rows';

export function runTests(sim: Simulator, suite: TestSuite, oracle?: CpuOracle): TestReport {
  if (suite.type === 'rom') return runRom(sim, suite);
  if (suite.type === 'cpu') return runCpu(sim, suite, oracle);
  if (suite.type === 'program') return runProgram(sim, suite, oracle);
  if (suite.type === 'truth-table') return runTruthTable(sim, suite);
  if (suite.type === 'sequence') return runSequence(sim, suite);
  let rows: TruthTableRow[];
  try {
    rows = referenceRows(sim.netlist.inputPins, suite.ref, suite.samples, suite.seed);
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    return finish([], err('unsupported', text, text));
  }
  return runTruthTable(sim, { type: 'truth-table', rows });
}

export function runTruthTable(sim: Simulator, suite: TruthTableSuite): TestReport {
  const results: TestCaseResult[] = [];
  for (let i = 0; i < suite.rows.length; i++) {
    const row = suite.rows[i] as TruthTableRow;
    for (const [pin, v] of Object.entries(row.in)) sim.setInput(pin, v);
    const settled = sim.settle();
    if (!settled.ok) return finish(results, oscillation(settled, sim, `แถวที่ ${i + 1}`, `row ${i + 1}`));
    results.push(check(sim, i, row.in, row.out));
  }
  return finish(results);
}

export function runSequence(sim: Simulator, suite: SequenceSuite): TestReport {
  const results: TestCaseResult[] = [];
  for (let i = 0; i < suite.steps.length; i++) {
    const step = suite.steps[i];
    if (!step) continue;
    const inputs = step.set ?? {};
    for (const [pin, v] of Object.entries(inputs)) sim.setInput(pin, v);
    let settled = sim.settle();
    for (let t = 0; settled.ok && t < (step.tick ?? 0); t++) settled = sim.tick(suite.clock);
    if (!settled.ok) return finish(results, oscillation(settled, sim, `step ที่ ${i + 1}`, `step ${i + 1}`));
    if (step.expect) results.push(check(sim, i, inputs, step.expect));
  }
  return finish(results);
}

export interface ComponentTestResult {
  diagnostics: Diagnostic[];
  /** null ถ้า compile ไม่ผ่าน */
  report: TestReport | null;
}

/** compile + สร้าง simulator + รันเทสต์ ในครั้งเดียว */
export function testComponent(
  lib: ComponentLibrary,
  defId: string,
  suite: TestSuite,
  mode: SimMode = 'fast',
  options?: CompileOptions,
  oracle?: CpuOracle,
): ComponentTestResult {
  if (suite.type === 'rom' || suite.type === 'cpu' || suite.type === 'program') {
    const harness =
      suite.type === 'rom'
        ? romHarness(lib, defId, suite.words, suite.width)
        : cpuHarness(lib, suite.type === 'program' ? suite.cpu : defId);
    if ('code' in harness) return { diagnostics: [harness], report: null };
    const { netlist, diagnostics } = compile(new ComponentLibrary([...lib.all(), harness]), harness.id, options);
    if (!netlist || hasErrors(diagnostics)) return { diagnostics, report: null };
    return { diagnostics, report: runTests(createSimulator(netlist, mode), suite, oracle) };
  }
  const { netlist, diagnostics } = compile(lib, defId, options);
  if (!netlist || hasErrors(diagnostics)) return { diagnostics, report: null };
  return { diagnostics, report: runTests(createSimulator(netlist, mode), suite, oracle) };
}

export const ROM_HARNESS_ID = 'test.rom-harness';
/** id ของแผงและของ ROM ที่ถูกทดสอบในวงจรห่อ (ใช้ loadPanel และ subscribe ตามชั้น) */
export const ROM_PANEL = 'panel';
export const ROM_DUT = 'dut';

/**
 * วงจรห่อสำหรับทดสอบ/ลองเล่น ROM: แผงค่าคงที่ → data ของ ROM, addr กับ out ต่อออกมาเป็นขาของวงจรห่อ
 * ROM ต้องมีขา addr, data (กว้าง words × width) และ out (กว้าง width)
 */
export function romHarness(lib: ComponentLibrary, defId: string, words: number, width: number): ComponentDef | Diagnostic {
  const def = lib.get(defId);
  const pin = (n: string) => def?.pins.find((p) => p.name === n);
  const addr = pin('addr');
  const data = pin('data');
  const out = pin('out');
  if (!def || !addr || !data || !out || data.width !== words * width || out.width !== width || 2 ** addr.width < words) {
    return err(
      'unknown-pin',
      `ROM ต้องมีขา addr, data (${words * width} บิต) และ out (${width} บิต)`,
      `A ROM needs pins addr, data (${words * width} bits) and out (${width} bits)`,
    );
  }
  return {
    id: ROM_HARNESS_ID,
    name: { th: 'ทดสอบ ROM', en: 'ROM harness' },
    kind: 'circuit',
    pins: [
      { name: 'addr', dir: 'in', width: addr.width },
      { name: 'out', dir: 'out', width },
    ],
    body: {
      instances: [
        { id: ROM_PANEL, defId: 'prim.panel', params: { words, width }, x: 0, y: 0, rotation: 0 },
        { id: ROM_DUT, defId, x: 0, y: 0, rotation: 0 },
      ],
      wires: [
        { id: 'w1', from: { inst: ROM_PANEL, pin: 'out' }, to: { inst: ROM_DUT, pin: 'data' } },
        { id: 'w2', from: { inst: 'self', pin: 'addr' }, to: { inst: ROM_DUT, pin: 'addr' } },
        { id: 'w3', from: { inst: ROM_DUT, pin: 'out' }, to: { inst: 'self', pin: 'out' } },
      ],
    },
  };
}

export const CPU_HARNESS_ID = 'test.cpu-harness';
/** โปรแกรมของ CPU: 256 คำสั่ง × 16 บิต */
export const CPU_PROG_WORDS = 256;
export const CPU_PROG_WIDTH = 16;
/** ขาดีบักที่เทียบกับ emulator ทุก cycle (out/leds/seg เทียบหลังโปรแกรมเขียนค่าแล้ว) */
export const CPU_DEBUG_PINS = ['pc', 'a', 'b', 'c', 'd', 'sp', 'flags', 'halt'] as const;
export const CPU_IO_PINS = ['out', 'leds', 'seg'] as const;

/**
 * วงจรห่อสำหรับทดสอบ/รัน CPU: แผงค่าคงที่ (โปรแกรม) → ขา prog ของ CPU
 * ขาอื่นของ CPU ต่อออกมาเป็นขาของวงจรห่อชื่อเดิม
 */
export function cpuHarness(lib: ComponentLibrary, defId: string): ComponentDef | Diagnostic {
  const def = lib.get(defId);
  const prog = def?.pins.find((p) => p.name === 'prog' && p.dir === 'in');
  if (!def || !prog || prog.width !== CPU_PROG_WORDS * CPU_PROG_WIDTH) {
    return err(
      'unknown-pin',
      `CPU ต้องมีขาเข้า prog กว้าง ${CPU_PROG_WORDS * CPU_PROG_WIDTH} บิต สำหรับต่อแผงโปรแกรม`,
      `A CPU needs an input pin prog of ${CPU_PROG_WORDS * CPU_PROG_WIDTH} bits for the program panel`,
    );
  }
  const others = def.pins.filter((p) => p !== prog);
  return {
    id: CPU_HARNESS_ID,
    name: { th: 'ทดสอบ CPU', en: 'CPU harness' },
    kind: 'circuit',
    pins: others.map((p) => ({ ...p })),
    body: {
      instances: [
        { id: ROM_PANEL, defId: 'prim.panel', params: { words: CPU_PROG_WORDS, width: CPU_PROG_WIDTH }, x: 0, y: 0, rotation: 0 },
        { id: ROM_DUT, defId, x: 0, y: 0, rotation: 0 },
      ],
      wires: [
        { id: 'w0', from: { inst: ROM_PANEL, pin: 'out' }, to: { inst: ROM_DUT, pin: 'prog' } },
        ...others.map((p, i) =>
          p.dir === 'in'
            ? { id: `w${i + 1}`, from: { inst: 'self', pin: p.name }, to: { inst: ROM_DUT, pin: p.name } }
            : { id: `w${i + 1}`, from: { inst: ROM_DUT, pin: p.name }, to: { inst: 'self', pin: p.name } },
        ),
      ],
    },
  };
}

/** reset CPU: reset = 1 แล้วเดินนาฬิกาหนึ่งจังหวะ (ใช้ทั้งตอนทดสอบและตอนรันบนหน้าจอ) */
export function resetCpu(sim: Simulator, inputs: Record<string, number> = {}): SettleResult {
  for (const [pin, v] of Object.entries(inputs)) if (sim.netlist.inputs.has(pin)) sim.setInput(pin, v);
  sim.setInput('clk', 0);
  sim.setInput('reset', 1);
  let r = sim.settle();
  if (r.ok) r = sim.tick('clk');
  sim.setInput('reset', 0);
  if (r.ok) r = sim.settle();
  return r;
}

function runCpu(sim: Simulator, suite: CpuSuite, oracle?: CpuOracle): TestReport {
  if (!oracle) {
    return finish([], err('unsupported', 'การทดสอบ CPU ต้องมี emulator อ้างอิง', 'CPU tests need a reference emulator'));
  }
  for (const pin of ['clk', 'reset']) {
    if (!sim.netlist.inputs.has(pin)) return finish([], err('unknown-pin', `CPU ต้องมีขาเข้า ${pin}`, `A CPU needs an input pin ${pin}`, pin));
  }
  const results: TestCaseResult[] = [];
  for (let p = 0; p < suite.programs.length; p++) {
    const program = suite.programs[p]!;
    const where = { th: `โปรแกรม "${program.name.th}"`, en: `program "${program.name.en}"` };
    let words: number[];
    let trace: CpuSnapshot[];
    try {
      words = oracle.assemble(program.source);
      trace = oracle.run(words, program.maxCycles, program.inputs ?? {});
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      return finish(results, err('unsupported', `${where.th}: ${text}`, `${where.en}: ${text}`));
    }
    sim.loadPanel(words, ROM_PANEL);
    let settled = resetCpu(sim, { sw: 0, btn: 0, key: 0, ...program.inputs });
    for (let k = 0; k < trace.length; k++) {
      if (k > 0 && settled.ok) settled = sim.tick('clk');
      if (!settled.ok) return finish(results, oscillation(settled, sim, `${where.th} cycle ${k}`, `${where.en} cycle ${k}`));
      const want = trace[k]!;
      const expected: Record<string, SignalValue> = {};
      for (const pin of [...CPU_DEBUG_PINS, ...CPU_IO_PINS]) {
        const v = want[pin];
        if (v !== undefined && sim.netlist.outputs.has(pin)) expected[pin] = v;
      }
      const row = check(sim, p, { program: p }, expected);
      if (row.ok && k < trace.length - 1) continue;
      row.cpu = { program: p, cycle: k };
      const prev = trace[k - 1];
      if (prev) {
        row.cpu.pc = prev.pc;
        row.cpu.instruction = oracle.disassemble(words[prev.pc] ?? 0);
      }
      results.push(row);
      break;
    }
    // โปรแกรมแรกที่ผิดพอแล้ว ที่เหลือไม่ต้องรัน
    if (results.at(-1)?.ok === false) break;
  }
  return finish(results);
}

/** ผลของโปรแกรมหนึ่งกรณี: ลำดับที่จอแสดง และค่าสุดท้ายของขาออก */
interface ProgramRun {
  outs: number[];
  halted: boolean;
  cycles: number;
  final: Record<string, SignalValue>;
}

/** เทียบผลกับที่ด่านต้องการ คืนรายการที่ไม่ตรง (ว่าง = ผ่าน) */
function programMismatch(run: ProgramRun, c: ProgramCase): string[] {
  const bad: string[] = [];
  if (!run.halted) bad.push('halt');
  const e = c.expect;
  if (e.outs && (e.outs.length !== run.outs.length || e.outs.some((v, i) => v !== run.outs[i]))) bad.push('outs');
  for (const pin of ['out', 'leds', 'seg'] as const) if (e[pin] !== undefined && run.final[pin] !== e[pin]) bad.push(pin);
  return bad;
}

/**
 * ด่านเขียนโปรแกรม: ใส่โปรแกรมของผู้เล่นลงแผง reset แล้วเดินนาฬิกาจนถึง HALT บน CPU ของผู้เล่น
 * ถ้าไม่ผ่านและมี emulator จะลองโปรแกรมเดียวกันบน emulator ด้วย เพื่อบอกว่าผิดที่โปรแกรมหรือที่ CPU
 */
function runProgram(sim: Simulator, suite: ProgramSuite, oracle?: CpuOracle): TestReport {
  const words = suite.words;
  if (!words) return finish([], err('unsupported', 'ยังไม่มีโปรแกรมให้ทดสอบ', 'no program to test'));
  const results: TestCaseResult[] = [];
  // ทุกกรณีเริ่มจากเครื่องที่เพิ่งเปิด (จอยังไม่มีค่า) ไม่ให้ค่าบนจอจากกรณีก่อนติดมา
  const first = sim.settle();
  if (!first.ok) return finish(results, oscillation(first, sim, 'ตอนเปิดเครื่อง', 'at power-up'));
  const fresh = sim.saveState();
  const freshCycle = sim.cycle;
  for (let i = 0; i < suite.cases.length; i++) {
    const c = suite.cases[i]!;
    sim.restoreState(fresh, freshCycle);
    sim.loadPanel(words, ROM_PANEL);
    let settled = resetCpu(sim, { sw: 0, btn: 0, key: 0, ...c.inputs });
    const run: ProgramRun = { outs: [], halted: false, cycles: 0, final: {} };
    const watch = (): void => {
      const v = sim.read('out');
      if (typeof v === 'number' && run.outs.at(-1) !== v) run.outs.push(v);
    };
    watch();
    while (settled.ok && sim.read('halt') !== 1 && run.cycles < c.maxCycles) {
      settled = sim.tick('clk');
      run.cycles++;
      watch();
    }
    if (!settled.ok) return finish(results, oscillation(settled, sim, `กรณี "${c.name.th}"`, `case "${c.name.en}"`));
    run.halted = sim.read('halt') === 1;
    for (const pin of ['out', 'leds', 'seg']) if (sim.netlist.outputs.has(pin)) run.final[pin] = sim.read(pin);
    const bad = programMismatch(run, c);
    const result: TestCaseResult = {
      index: i,
      ok: bad.length === 0,
      inputs: { ...(c.inputs ?? {}) },
      expected: Object.fromEntries((['out', 'leds', 'seg'] as const).filter((p) => c.expect[p] !== undefined).map((p) => [p, c.expect[p]!])),
      actual: run.final,
      program: { outs: run.outs, halted: run.halted, cycles: run.cycles },
    };
    if (!result.ok && oracle) {
      const trace = oracle.run(words, c.maxCycles, c.inputs ?? {});
      const emu: ProgramRun = { outs: [], halted: trace.at(-1)?.halt === 1, cycles: trace.length - 1, final: {} };
      for (const s of trace) if (s.out !== undefined && emu.outs.at(-1) !== s.out) emu.outs.push(s.out);
      const last = trace.at(-1)!;
      for (const pin of ['out', 'leds', 'seg'] as const) emu.final[pin] = last[pin] ?? 'X';
      result.program!.emulatorPassed = programMismatch(emu, c).length === 0;
    }
    results.push(result);
  }
  return finish(results);
}

/** ข้อมูลตัวอย่างใส่แผง (ไม่ซ้ำกันทุกคำ เห็นชัดว่าอ่านคำไหนออกมา) */
export function romSampleWords(words: number, width: number, seed = 1): number[] {
  const max = 2 ** width;
  let x = (seed * 2654435761) >>> 0;
  const out: number[] = [];
  const seen = new Set<number>();
  while (out.length < words) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    const w = (x >>> 7) % max;
    if (seen.has(w) && seen.size < max) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

function runRom(sim: Simulator, suite: RomSuite): TestReport {
  const results: TestCaseResult[] = [];
  let index = 0;
  for (const seed of [suite.seed ?? 1, (suite.seed ?? 1) + 1]) {
    sim.loadPanel(romSampleWords(suite.words, suite.width, seed), ROM_PANEL);
    for (let a = 0; a < suite.words; a++) {
      sim.setInput('addr', a);
      const settled = sim.settle();
      if (!settled.ok) return finish(results, oscillation(settled, sim, `address ${a}`, `address ${a}`));
      const word = romSampleWords(suite.words, suite.width, seed)[a] as number;
      results.push(check(sim, index++, { addr: a }, { out: word }));
    }
  }
  return finish(results);
}

function check(
  sim: Simulator,
  index: number,
  inputs: Record<string, SignalValue>,
  expected: Record<string, SignalValue>,
): TestCaseResult {
  const actual: Record<string, SignalValue> = {};
  let ok = true;
  for (const [pin, want] of Object.entries(expected)) {
    const got = sim.read(pin);
    actual[pin] = got;
    if (got !== want) ok = false;
  }
  return { index, ok, inputs: { ...inputs }, expected: { ...expected }, actual };
}

function oscillation(r: Extract<SettleResult, { ok: false }>, sim: Simulator, whereTh: string, whereEn: string): Diagnostic {
  const names = r.nets.slice(0, 4).map((n) => sim.netlist.netNames[n]?.[0] ?? `net${n}`);
  return err(
    'oscillation',
    `${whereTh}: วงจรสลับค่าไปมาไม่หยุด ที่ ${names.join(', ')}`,
    `${whereEn}: circuit never settles, at ${names.join(', ')}`,
    names[0],
    r.nets,
  );
}

function finish(results: TestCaseResult[], error?: Diagnostic): TestReport {
  const failed = results.filter((r) => !r.ok).length;
  const report: TestReport = { passed: !error && failed === 0, total: results.length, failed, results };
  const first = results.find((r) => !r.ok);
  if (first) report.firstFailure = first;
  if (error) report.error = error;
  return report;
}

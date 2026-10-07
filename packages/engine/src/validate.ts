import type {
  ComponentDef,
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

export function runTests(sim: Simulator, suite: TestSuite): TestReport {
  if (suite.type === 'rom') return runRom(sim, suite);
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
): ComponentTestResult {
  if (suite.type === 'rom') {
    const harness = romHarness(lib, defId, suite.words, suite.width);
    if ('code' in harness) return { diagnostics: [harness], report: null };
    const { netlist, diagnostics } = compile(new ComponentLibrary([...lib.all(), harness]), harness.id, options);
    if (!netlist || hasErrors(diagnostics)) return { diagnostics, report: null };
    return { diagnostics, report: runRom(createSimulator(netlist, mode), suite) };
  }
  const { netlist, diagnostics } = compile(lib, defId, options);
  if (!netlist || hasErrors(diagnostics)) return { diagnostics, report: null };
  return { diagnostics, report: runTests(createSimulator(netlist, mode), suite) };
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

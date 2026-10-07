import type {
  Diagnostic,
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
import type { ComponentLibrary } from './library';
import type { SettleResult, Simulator } from './sim/base';
import { createSimulator } from './sim/create';
import { referenceRows } from './references';

export { MAX_EXHAUSTIVE_BITS, exhaustiveRows } from './rows';

export function runTests(sim: Simulator, suite: TestSuite): TestReport {
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
  const { netlist, diagnostics } = compile(lib, defId, options);
  if (!netlist || hasErrors(diagnostics)) return { diagnostics, report: null };
  return { diagnostics, report: runTests(createSimulator(netlist, mode), suite) };
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

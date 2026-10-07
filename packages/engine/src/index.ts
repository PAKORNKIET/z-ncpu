// @z-ncpu/engine — แกนจำลองวงจรของ Z-NCPU (TS ล้วน ไม่มี UI ตาม Rule 2)

export { X, NAND_TABLE, nand } from './logic';
export { PRIMITIVES, PRIMITIVES_VERSION, MAX_WIDTH, isPrimitive } from './primitives';
export type { PrimitiveKind, PrimitiveSpec } from './primitives';
export { ComponentLibrary } from './library';
export { CircuitBuilder, circuit, inp, out } from './builder';
export { contentHash, findDependents, cyrb53 } from './hash';
export { compile, DEFAULT_LIMITS, scopePins } from './flatten';
export type { Netlist, CompileOptions, CompileResult, ScopeInstance } from './flatten';
export { hasErrors } from './diag';
export { Simulator, toBits } from './sim/base';
export type { SettleResult } from './sim/base';
export { VisualSimulator } from './sim/visual';
export type { VisualOptions } from './sim/visual';
export { FastSimulator } from './sim/fast';
export type { FastOptions } from './sim/fast';
export { buildSchedule } from './sim/schedule';
export type { Schedule } from './sim/schedule';
export { createSimulator } from './sim/create';
export {
  runTests,
  runTruthTable,
  runSequence,
  exhaustiveRows,
  testComponent,
  MAX_EXHAUSTIVE_BITS,
} from './validate';
export type { ComponentTestResult } from './validate';
export { REFERENCES, referenceRows } from './references';
export type { ReferenceFn } from './references';

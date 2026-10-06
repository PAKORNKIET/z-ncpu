// Types กลางของ Z-NCPU ที่ทุก package ใช้ร่วมกัน (Architecture Spec v3 ส่วน 5)

/** ค่าของสัญญาณหนึ่งบิต: 0, 1 หรือ 2 = X (ยังไม่รู้ค่า) */
export type Bit = 0 | 1 | 2;

/** ค่าของ pin ทั้งเส้น: ตัวเลข (bit 0 = LSB) หรือ 'X' ถ้ามีบิตใดยังไม่รู้ค่า */
export type SignalValue = number | 'X';

export interface LocalizedText {
  th: string;
  en: string;
}

export type PinDir = 'in' | 'out';

export interface PinDef {
  name: string;
  dir: PinDir;
  /** ความกว้างเป็นบิต: bus ปกติ 1..16, มัดสาย (bundle) สำหรับข้อมูล ROM ได้ถึง 4096 */
  width: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface Instance {
  id: string;
  /** ชี้ def ล่าสุดในโปรเจกต์เสมอ */
  defId: string;
  /** เช่น width ของ prim.split / prim.merge */
  params?: Record<string, number>;
  x: number;
  y: number;
  rotation: Rotation;
  label?: string;
}

/** inst = 'self' หมายถึง pin ของวงจรนี้เอง */
export interface PinRef {
  inst: string;
  pin: string;
}

export interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
  points?: [number, number][];
}

export interface CircuitBody {
  instances: Instance[];
  wires: Wire[];
}

export interface ComponentMeta {
  createdAt?: string;
  updatedAt?: string;
  levelId?: string;
}

export interface ComponentDef {
  /** เช่น "prim.nand", "user.xor" */
  id: string;
  name: LocalizedText;
  kind: 'primitive' | 'circuit';
  pins: PinDef[];
  /** เฉพาะ kind = 'circuit' */
  body?: CircuitBody;
  meta?: ComponentMeta;
}

// ---------- Diagnostics ----------

export type DiagnosticCode =
  | 'unknown-def'
  | 'unknown-instance'
  | 'unknown-pin'
  | 'duplicate-id'
  | 'bad-param'
  | 'width-mismatch'
  | 'recursive-def'
  | 'depth-limit'
  | 'gate-limit'
  | 'multiple-drivers'
  | 'floating'
  | 'oscillation'
  | 'unsupported';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: 'error' | 'warning';
  message: LocalizedText;
  /** ตำแหน่งในลำดับชั้น เช่น "adder/fa2/xor1.a" */
  path?: string;
  nets?: number[];
}

// ---------- Tests (Spec ส่วน 7) ----------

export interface TruthTableRow {
  in: Record<string, SignalValue>;
  out: Record<string, SignalValue>;
}

export interface TruthTableSuite {
  type: 'truth-table';
  rows: TruthTableRow[];
}

export interface SequenceStep {
  set?: Record<string, SignalValue>;
  /** จำนวน clock tick หลังจากใส่ค่า set */
  tick?: number;
  expect?: Record<string, SignalValue>;
}

export interface SequenceSuite {
  type: 'sequence';
  /** ชื่อ input pin ที่เป็น clock (ไม่ต้องใส่ถ้าวงจรไม่มี clock เช่น SR Latch) */
  clock?: string;
  steps: SequenceStep[];
}

export type TestSuite = TruthTableSuite | SequenceSuite;

export interface TestCaseResult {
  index: number;
  ok: boolean;
  inputs: Record<string, SignalValue>;
  expected: Record<string, SignalValue>;
  actual: Record<string, SignalValue>;
}

export interface TestReport {
  passed: boolean;
  total: number;
  failed: number;
  results: TestCaseResult[];
  /** แถวหรือ step แรกที่ผิด ใช้แสดงผลและให้ hint engine อ่าน */
  firstFailure?: TestCaseResult;
  /** ปัญหาที่ทำให้ทดสอบต่อไม่ได้ เช่น oscillation */
  error?: Diagnostic;
}

// ---------- Content (Spec ส่วน 13, 16) ----------

export interface LevelDef {
  id: string;
  chapter: number;
  title: LocalizedText;
  /** key ของบทเรียน เช่น "logic/not" → lessons/<lang>/logic/not.md */
  lesson: string;
  /** def id ที่ผู้เล่นวางได้ในด่านนี้ */
  available: string[];
  target: {
    defId: string;
    pins: PinDef[];
  };
  tests: TestSuite;
  optimize?: { bestNand?: number };
  limits?: { maxNand?: number };
  unlocks: string[];
  hints: string[];
  glossary: string[];
}

export interface GlossaryEntry {
  id: string;
  th: string;
  en: string;
  explain_th: string;
}

// ---------- File format (Spec ส่วน 15) ----------

export interface ProgramSource {
  id: string;
  isa: string;
  source: string;
}

export interface LevelProgress {
  passedHash?: string;
  attempts: number;
}

export interface ZncpuFile {
  format: 'zncpu';
  schemaVersion: 1;
  app: string;
  project: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  components: ComponentDef[];
  programs: ProgramSource[];
  progress: Record<string, LevelProgress>;
  settings: Record<string, unknown>;
}

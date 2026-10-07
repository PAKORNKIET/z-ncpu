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

/**
 * วงจรที่ขาเข้ารวมเกิน 16 บิต (เช่นบวกเลข 8 บิต) ทดสอบครบทุกกรณีไม่ไหว (Spec ส่วน 7)
 * จึงใช้กรณีขอบ + สุ่ม samples แถว เทียบกับฟังก์ชันอ้างอิงชื่อ ref ที่อยู่ในโค้ดของ engine
 * ไฟล์ด่านจึงยังเป็นข้อมูลล้วน ไม่มีโค้ด (ถ้าขาเข้าไม่เกิน 16 บิตจะทดสอบครบทุกกรณีแทน)
 */
export interface ReferenceSuite {
  type: 'reference';
  ref: string;
  /** จำนวนแถวสุ่ม (ค่าเริ่มต้น 2000) */
  samples?: number;
  /** seed ของการสุ่ม ทำให้ได้แถวเดิมทุกครั้ง */
  seed?: number;
}

/**
 * ทดสอบ ROM (Spec ส่วน 11): ROM รับโปรแกรมทางมัดสาย data ที่กว้างเกินจะตั้งค่าด้วยมือ
 * engine จึงสร้างวงจรห่อที่มีแผงค่าคงที่ words คำ × width บิตต่อเข้า data ใส่ข้อมูลสุ่ม แล้วอ่านทุก addr
 * (ทำสองชุดข้อมูล กันวงจรที่จำค่าตายตัวไว้)
 */
export interface RomSuite {
  type: 'rom';
  words: number;
  width: number;
  seed?: number;
}

/** ขาเข้าของ I/O ที่ CPU อ่านได้ (Spec ส่วน 10: 0xF8 สวิตช์, 0xF9 ปุ่ม, 0xFA คีย์บอร์ด) */
export interface CpuInputs {
  sw?: number;
  btn?: number;
  key?: number;
}

/** โปรแกรมทดสอบ CPU: ซอร์ส assembly ที่ assemble ตอนทดสอบ (ไฟล์ด่านจึงไม่มีโค้ดที่รันได้) */
export interface CpuProgram {
  name: LocalizedText;
  source: string;
  /** จำนวน clock สูงสุด (หยุดก่อนถ้าถึง HALT) */
  maxCycles: number;
  inputs?: CpuInputs;
}

/**
 * ทดสอบ CPU ทั้งเครื่อง (Spec ส่วน 17 "โปรแกรมบน CPU"): ใส่โปรแกรมลงแผงค่าคงที่ที่ต่อเข้าขา prog
 * กด reset แล้วเดินนาฬิกา เทียบขาดีบักกับ emulator อ้างอิงทุก cycle
 */
export interface CpuSuite {
  type: 'cpu';
  programs: CpuProgram[];
}

export type TestSuite = TruthTableSuite | SequenceSuite | ReferenceSuite | RomSuite | CpuSuite;

/**
 * ค่าที่ขาของ CPU หลัง tick (ตรงกับขาดีบักของด่าน CPU) flags = Z<<2 | C<<1 | N
 * out/leds/seg เป็น undefined จนกว่าโปรแกรมจะเขียน (register ของ I/O ไม่ต้อง reset)
 */
export interface CpuSnapshot {
  cycle: number;
  pc: number;
  a: number;
  b: number;
  c: number;
  d: number;
  sp: number;
  flags: number;
  halt: number;
  out?: number;
  leds?: number;
  /** รูปแบบไฟ 7 ส่วนของเลขฐานสิบหกในบิตล่างของค่าที่เขียนที่ 0xF2 */
  seg?: number;
}

/**
 * คำตอบอ้างอิงของ CPU ที่ส่งเข้า engine ตอนทดสอบ (engine import @z-ncpu/isa ไม่ได้ตามกฎ dependency)
 * assemble โยน Error เมื่อซอร์สผิด
 */
export interface CpuOracle {
  assemble(source: string): number[];
  run(words: readonly number[], maxCycles: number, inputs: CpuInputs): CpuSnapshot[];
  disassemble(word: number): string;
}

export interface TestCaseResult {
  index: number;
  ok: boolean;
  inputs: Record<string, SignalValue>;
  expected: Record<string, SignalValue>;
  actual: Record<string, SignalValue>;
  /** ด่าน CPU: ผิดที่โปรแกรมไหน cycle ไหน หลังคำสั่งอะไร */
  cpu?: { program: number; cycle: number; pc?: number; instruction?: string };
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

/** อุปกรณ์แสดงผลบนหน้าจอ: จอตัวเลข, LED 8 ดวง, จอ 7 ส่วน */
export type DeviceKind = 'number' | 'leds' | 'seg7';

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
  /** แสดงขาออกเป็นอุปกรณ์บนหน้าจอ เช่น { seg: 'seg7' } (Spec ส่วน 10: จอ, LED, 7-segment) */
  devices?: Record<string, DeviceKind>;
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
  /** content hash ของวงจรตอนที่ผ่านด่าน ถ้าวงจรตอนนี้ hash ไม่ตรง = ต้องทดสอบใหม่ */
  passedHash?: string;
  attempts: number;
  /** จำนวน NAND น้อยที่สุดที่เคยผ่าน */
  bestNand?: number;
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

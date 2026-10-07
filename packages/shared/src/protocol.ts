// ข้อความระหว่าง UI thread กับ Web Worker (Architecture Spec v3 ส่วน 14)
// ทุกข้อความจาก UI มี rid เพื่อจับคู่กับคำตอบ

import type { ComponentDef, Diagnostic, LocalizedText, SignalValue, TestReport, TestSuite } from './types';

export type SimMode = 'visual' | 'fast';

/** คำตอบของ Why? (ตรงกับ WhyResult ของ engine) */
export interface WhyAnswer {
  key: string;
  value: SignalValue;
  driver:
    | { kind: 'instance'; id: string; pins: string[] }
    | { kind: 'self'; pins: string[] }
    | { kind: 'const' }
    | { kind: 'panel' }
    | { kind: 'none' };
  causes: { key: string; value: SignalValue }[];
  state: boolean;
}

export type UiToWorker =
  | { rid: number; type: 'load'; components: ComponentDef[] }
  | { rid: number; type: 'compile'; defId: string; mode: SimMode }
  | { rid: number; type: 'setInput'; pin: string; value: SignalValue }
  /** ใส่ข้อมูลลงแผงค่าคงที่ (path ของแผงในวงจร) แล้ว settle */
  | { rid: number; type: 'loadPanel'; panel: string; words: number[] }
  | { rid: number; type: 'step'; count: number }
  | { rid: number; type: 'run'; hz: number }
  | { rid: number; type: 'pause' }
  | { rid: number; type: 'reset' }
  /** reset CPU: ขา reset = 1 เดินนาฬิกาหนึ่งจังหวะแล้วปล่อย นับ cycle ใหม่จาก 0 (แผงโปรแกรมยังอยู่) */
  | { rid: number; type: 'resetCpu' }
  /**
   * ตั้ง breakpoint (null = ลบ) ตอน run หยุดเมื่อเงื่อนไขเป็นจริงหรือขา halt = 1
   * scopePrefix: ชั้นของวงจรผู้เล่นใน net("...") เช่น 'dut' เมื่อจำลองผ่านวงจรห่อ
   */
  | { rid: number; type: 'breakpoint'; expr: string | null; scopePrefix?: string }
  /** time travel: ย้อน/เดินหน้าไป cycle (นับจาก reset CPU) ภายในช่วงที่บันทึกไว้ */
  | { rid: number; type: 'seek'; cycle: number }
  /** Logic Analyzer: ขอค่าของขาตั้งแต่ cycle from ถึง to */
  | { rid: number; type: 'trace'; from: number; to: number; pins: string[] }
  | { rid: number; type: 'test'; defId: string; tests: TestSuite; mode: SimMode }
  | { rid: number; type: 'probe'; net: number }
  /** Why?: ค่าที่ขา key ("ชิ้น.ขา" หรือ "self.ขา") ในชั้น scope มาจากไหน */
  | { rid: number; type: 'why'; scope: string; key: string }
  /** ขอค่าของทุกขาในชั้นหนึ่งไปกับทุก signals: '' = ชั้นบนสุด, 'g/inv' = X-Ray ข้างใน inv ที่อยู่ใน g */
  | { rid: number; type: 'subscribe'; scopePath: string };

export interface CompileStats {
  nets: number;
  gates: number;
  inputs: string[];
  outputs: string[];
}

export type WorkerToUi =
  | { rid: number; type: 'loaded'; components: number }
  | { rid: number; type: 'compiled'; defId: string; mode: SimMode; stats: CompileStats | null; diagnostics: Diagnostic[] }
  | {
      rid: number;
      type: 'signals';
      cycle: number;
      pins: Record<string, SignalValue>;
      /** ค่าของทุกขาในชั้นที่ subscribe ไว้ (key = "ชื่อชิ้น.ชื่อขา" และ "self.ชื่อขา") ใช้ระบายสีสาย */
      scope?: Record<string, SignalValue>;
      /** ชั้นของค่าใน scope เช่น '' = บนสุด, 'g/inv' = ข้างใน inv ที่อยู่ใน g */
      scopePath?: string;
      /** ช่วง cycle ที่ย้อนดูได้ (time travel) และขาที่บันทึกไว้ */
      history?: { first: number; last: number; pins: { name: string; width: number }[] };
    }
  /** reason: เหตุที่หยุดเอง ('breakpoint' หรือ 'halt') */
  | { rid: number; type: 'status'; cycle: number; running: boolean; reason?: 'breakpoint' | 'halt' }
  /** ผลการตั้ง breakpoint: error บอกคอลัมน์ที่ผิด */
  | { rid: number; type: 'breakpointSet'; ok: boolean; error?: { col: number; message: LocalizedText } }
  | { rid: number; type: 'traceData'; from: number; to: number; columns: Record<string, (number | null)[]> }
  | { rid: number; type: 'whyResult'; result: WhyAnswer | null }
  | { rid: number; type: 'testResult'; defId: string; mode: SimMode; report: TestReport | null; diagnostics: Diagnostic[] }
  | { rid: number; type: 'diagnostics'; diagnostics: Diagnostic[] };

// ข้อความระหว่าง UI thread กับ Web Worker (Architecture Spec v3 ส่วน 14)
// ทุกข้อความจาก UI มี rid เพื่อจับคู่กับคำตอบ

import type { ComponentDef, Diagnostic, SignalValue, TestReport, TestSuite } from './types';

export type SimMode = 'visual' | 'fast';

export type UiToWorker =
  | { rid: number; type: 'load'; components: ComponentDef[] }
  | { rid: number; type: 'compile'; defId: string; mode: SimMode }
  | { rid: number; type: 'setInput'; pin: string; value: SignalValue }
  | { rid: number; type: 'step'; count: number }
  | { rid: number; type: 'run'; hz: number }
  | { rid: number; type: 'pause' }
  | { rid: number; type: 'reset' }
  | { rid: number; type: 'seek'; cycle: number }
  | { rid: number; type: 'test'; defId: string; tests: TestSuite; mode: SimMode }
  | { rid: number; type: 'probe'; net: number }
  | { rid: number; type: 'why'; net: number; cycle: number }
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
    }
  | { rid: number; type: 'status'; cycle: number; running: boolean }
  | { rid: number; type: 'testResult'; defId: string; mode: SimMode; report: TestReport | null; diagnostics: Diagnostic[] }
  | { rid: number; type: 'diagnostics'; diagnostics: Diagnostic[] };

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
  /** scopePath '' = ชั้นบนสุด (M1) ชั้นที่ลึกกว่าสำหรับ X-Ray มาทีหลัง */
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
      /** ค่าของทุกขาในชั้นบนสุด (key = "ชื่อชิ้น.ชื่อขา") ส่งมาเมื่อ subscribe scopePath '' แล้ว ใช้ระบายสีสาย */
      scope?: Record<string, SignalValue>;
    }
  | { rid: number; type: 'status'; cycle: number; running: boolean }
  | { rid: number; type: 'testResult'; defId: string; mode: SimMode; report: TestReport | null; diagnostics: Diagnostic[] }
  | { rid: number; type: 'diagnostics'; diagnostics: Diagnostic[] };

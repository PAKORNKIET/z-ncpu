// hook สำหรับคุยกับ engine ใน Web Worker
import type { Diagnostic, SignalValue, WorkerToUi } from '@z-ncpu/shared';
import { useEffect, useState } from 'react';
import { EngineClient, EngineClosedError } from './engine-client';

/**
 * ใช้ EngineClient หนึ่งตัวต่อ panel และรับค่า pin ล่าสุด
 * สร้าง Worker ใน effect (ไม่ใช่ useMemo) เพราะ React StrictMode ตอน dev จะ mount → unmount → mount
 * ถ้าสร้างครั้งเดียวด้วย useMemo รอบ unmount จะปิด Worker ไปแล้ว และรอบที่สองจะได้ Worker ที่ตายแล้ว
 */
export function useEngine() {
  const [client, setClient] = useState<EngineClient | null>(null);
  const [pins, setPins] = useState<Record<string, SignalValue>>({});
  const [cycle, setCycle] = useState(0);
  const [running, setRunning] = useState(false);
  /** เหตุที่หยุดเองครั้งล่าสุด (breakpoint หรือ HALT) ล้างเมื่อเริ่มรันใหม่ */
  const [stopReason, setStopReason] = useState<'breakpoint' | 'halt' | undefined>();
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  /** ค่าของทุกขาในชั้นที่ subscribe ไว้ พร้อมบอกว่าเป็นชั้นไหน */
  const [scope, setScope] = useState<{ path: string; values: Record<string, SignalValue> }>({ path: '', values: {} });

  useEffect(() => {
    const engine = new EngineClient();
    engine.subscribe((msg: WorkerToUi) => {
      if (msg.type === 'signals') {
        setPins(msg.pins);
        setScope({ path: msg.scopePath ?? '', values: msg.scope ?? {} });
        setCycle(msg.cycle);
      } else if (msg.type === 'status') {
        setRunning(msg.running);
        setStopReason(msg.reason);
        setCycle(msg.cycle);
      } else if (msg.type === 'diagnostics') {
        setDiagnostics(msg.diagnostics);
        setRunning(false);
      }
    });
    setClient(engine);
    return () => engine.terminate();
  }, []);

  return { client, pins, scope, cycle, running, stopReason, diagnostics, setDiagnostics };
}

/** รันขั้นตอนเริ่มต้นแบบ async และไม่ทำต่อถ้า panel ถูก unmount หรือ client ถูกปิดระหว่างทาง */
export function useEngineSetup(
  client: EngineClient | null,
  setup: (client: EngineClient, isActive: () => boolean) => Promise<void>,
  deps: unknown[],
): void {
  useEffect(() => {
    if (!client) return;
    let active = true;
    setup(client, () => active).catch((e: unknown) => {
      if (!(e instanceof EngineClosedError)) console.error(e);
    });
    return () => {
      active = false;
    };
  }, [client, ...deps]);
}


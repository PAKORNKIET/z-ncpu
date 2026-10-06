// ฝั่ง UI ของ Worker protocol: ส่ง command แล้วรอคำตอบตาม rid
import type { UiToWorker, WorkerToUi } from '@z-ncpu/shared';

type Command = UiToWorker extends infer M ? (M extends UiToWorker ? Omit<M, 'rid'> : never) : never;
type Listener = (msg: WorkerToUi) => void;

/** ใช้แยกกรณี "client ถูกปิดไปแล้ว" ออกจาก error จริง */
export class EngineClosedError extends Error {
  constructor() {
    super('engine ถูกปิดแล้ว');
  }
}

export class EngineClient {
  private readonly worker: Worker;
  private nextRid = 1;
  private closed = false;
  private readonly listeners = new Set<Listener>();
  private readonly waiting = new Map<number, { resolve: (msg: WorkerToUi) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerToUi>) => {
      const msg = event.data;
      const pending = this.waiting.get(msg.rid);
      if (pending && msg.type !== 'signals' && msg.type !== 'diagnostics') {
        this.waiting.delete(msg.rid);
        pending.resolve(msg);
      }
      for (const l of this.listeners) l(msg);
    };
  }

  /** ส่ง command; promise คืนค่าคำตอบหลักของ command นั้น (ไม่ใช่ signals) และ reject ถ้า client ถูกปิด */
  send(cmd: Command): Promise<WorkerToUi> {
    if (this.closed) return Promise.reject(new EngineClosedError());
    const rid = this.nextRid++;
    return new Promise((resolve, reject) => {
      this.waiting.set(rid, { resolve, reject });
      this.worker.postMessage({ ...cmd, rid } as UiToWorker);
    });
  }

  /** ส่งโดยไม่รอคำตอบ (เช่น setInput, step) ไม่ทำอะไรถ้า client ถูกปิดแล้ว */
  post(cmd: Command): void {
    if (this.closed) return;
    this.worker.postMessage({ ...cmd, rid: this.nextRid++ } as UiToWorker);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate(): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    for (const { reject } of this.waiting.values()) reject(new EngineClosedError());
    this.waiting.clear();
    this.listeners.clear();
  }
}

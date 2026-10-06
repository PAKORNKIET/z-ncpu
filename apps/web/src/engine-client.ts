// ฝั่ง UI ของ Worker protocol: ส่ง command แล้วรอคำตอบตาม rid
import type { UiToWorker, WorkerToUi } from '@z-ncpu/shared';

type Command = UiToWorker extends infer M ? (M extends UiToWorker ? Omit<M, 'rid'> : never) : never;
type Listener = (msg: WorkerToUi) => void;

export class EngineClient {
  private readonly worker: Worker;
  private nextRid = 1;
  private readonly listeners = new Set<Listener>();
  private readonly waiting = new Map<number, (msg: WorkerToUi) => void>();

  constructor() {
    this.worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerToUi>) => {
      const msg = event.data;
      const resolve = this.waiting.get(msg.rid);
      if (resolve && msg.type !== 'signals' && msg.type !== 'diagnostics') {
        this.waiting.delete(msg.rid);
        resolve(msg);
      }
      for (const l of this.listeners) l(msg);
    };
  }

  /** ส่ง command; promise คืนค่าคำตอบหลักของ command นั้น (ไม่ใช่ signals) */
  send(cmd: Command): Promise<WorkerToUi> {
    const rid = this.nextRid++;
    return new Promise((resolve) => {
      this.waiting.set(rid, resolve);
      this.worker.postMessage({ ...cmd, rid } as UiToWorker);
    });
  }

  /** ส่งโดยไม่รอคำตอบ (เช่น setInput, step) */
  post(cmd: Command): void {
    this.worker.postMessage({ ...cmd, rid: this.nextRid++ } as UiToWorker);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  terminate(): void {
    this.worker.terminate();
  }
}

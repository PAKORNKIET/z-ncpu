/// <reference lib="webworker" />
// Web Worker ที่ถือ engine ตัวเดียว (Spec ส่วน 3, 14)
// UI ส่ง command มา ส่วน Worker ส่งค่า pin ของวงจรกลับ (และค่าทุกขาในชั้นบนสุดถ้า subscribe ไว้)

import {
  ComponentLibrary,
  compile,
  createSimulator,
  hasErrors,
  testComponent,
  type Simulator,
} from '@z-ncpu/engine';
import type { SignalValue, SimMode, UiToWorker, WorkerToUi } from '@z-ncpu/shared';

declare const self: DedicatedWorkerGlobalScope;

let lib = new ComponentLibrary();
let sim: Simulator | null = null;
let clockPin: string | undefined;
let simMode: SimMode = 'fast';
let timer: ReturnType<typeof setInterval> | null = null;
/** ส่งค่าของทุกขาในชั้นบนสุดไปด้วยไหม (เปิดด้วย subscribe scopePath '') */
let scopeOn = false;

const post = (msg: WorkerToUi): void => self.postMessage(msg);

function pins(): Record<string, SignalValue> {
  if (!sim) return {};
  const out: Record<string, SignalValue> = {};
  for (const name of [...sim.netlist.inputs.keys(), ...sim.netlist.outputs.keys()]) out[name] = sim.read(name);
  return out;
}

function signals(rid: number): WorkerToUi {
  const msg: Extract<WorkerToUi, { type: 'signals' }> = { rid, type: 'signals', cycle: sim?.cycle ?? 0, pins: pins() };
  if (scopeOn && sim) msg.scope = sim.readScope();
  return msg;
}

function stop(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

function reportOscillation(rid: number, nets: number[]): void {
  stop();
  const names = nets.slice(0, 4).map((n) => sim?.netlist.netNames[n]?.[0] ?? `net${n}`);
  post({
    rid,
    type: 'diagnostics',
    diagnostics: [
      {
        code: 'oscillation',
        severity: 'error',
        message: { th: `วงจรสลับค่าไปมาไม่หยุด ที่ ${names.join(', ')}`, en: `Circuit never settles at ${names.join(', ')}` },
        nets,
      },
    ],
  });
}

/** tick ทีละหลายครั้ง แล้วส่งค่าออกครั้งเดียว */
function step(rid: number, count: number): boolean {
  if (!sim) return false;
  for (let i = 0; i < count; i++) {
    const r = sim.tick(clockPin);
    if (!r.ok) {
      reportOscillation(rid, r.nets);
      return false;
    }
  }
  post(signals(rid));
  return true;
}

self.onmessage = (event: MessageEvent<UiToWorker>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'load':
        stop();
        lib = new ComponentLibrary(msg.components);
        sim = null;
        post({ rid: msg.rid, type: 'loaded', components: msg.components.length });
        return;

      case 'compile': {
        stop();
        const { netlist, diagnostics } = compile(lib, msg.defId);
        simMode = msg.mode;
        sim = netlist && !hasErrors(diagnostics) ? createSimulator(netlist, simMode) : null;
        // M0: ถ้าวงจรมี input ชื่อ clk ถือว่าเป็น clock
        clockPin = netlist?.inputs.has('clk') ? 'clk' : undefined;
        post({
          rid: msg.rid,
          type: 'compiled',
          defId: msg.defId,
          mode: msg.mode,
          stats: netlist
            ? {
                nets: netlist.netCount,
                gates: netlist.gateCount,
                inputs: [...netlist.inputs.keys()],
                outputs: [...netlist.outputs.keys()],
              }
            : null,
          diagnostics,
        });
        if (sim) post(signals(msg.rid));
        return;
      }

      case 'setInput': {
        if (!sim) return;
        sim.setInput(msg.pin, msg.value);
        const r = sim.settle();
        if (!r.ok) reportOscillation(msg.rid, r.nets);
        post(signals(msg.rid));
        return;
      }

      case 'step':
        step(msg.rid, msg.count);
        return;

      case 'run': {
        stop();
        // ส่งค่าออก ~30 ครั้งต่อวินาที ไม่ว่า hz จะเท่าไร
        const frameMs = 33;
        const perFrame = Math.max(1, Math.round((msg.hz * frameMs) / 1000));
        const interval = msg.hz >= 30 ? frameMs : Math.round(1000 / msg.hz);
        timer = setInterval(() => {
          if (!step(msg.rid, msg.hz >= 30 ? perFrame : 1)) stop();
        }, interval);
        post({ rid: msg.rid, type: 'status', cycle: sim?.cycle ?? 0, running: true });
        return;
      }

      case 'pause':
        stop();
        post({ rid: msg.rid, type: 'status', cycle: sim?.cycle ?? 0, running: false });
        return;

      case 'reset':
        stop();
        if (sim) sim = createSimulator(sim.netlist, simMode);
        post(signals(msg.rid));
        post({ rid: msg.rid, type: 'status', cycle: 0, running: false });
        return;

      case 'test': {
        const { report, diagnostics } = testComponent(lib, msg.defId, msg.tests, msg.mode);
        post({ rid: msg.rid, type: 'testResult', defId: msg.defId, mode: msg.mode, report, diagnostics });
        return;
      }

      case 'subscribe':
        if (msg.scopePath === '') {
          scopeOn = true;
          post({ rid: msg.rid, type: 'status', cycle: sim?.cycle ?? 0, running: timer !== null });
          if (sim) post(signals(msg.rid));
          return;
        }
        post({
          rid: msg.rid,
          type: 'diagnostics',
          diagnostics: [
            {
              code: 'unsupported',
              severity: 'warning',
              message: { th: 'ดูค่าข้างในชิ้นส่วน (X-Ray) ยังไม่รองรับ', en: 'Inspecting inside components (X-Ray) is not supported yet' },
            },
          ],
        });
        return;

      case 'seek':
      case 'probe':
      case 'why':
        // M1–M3: time travel, probe, Why? และ subscribe ตามชั้น
        post({
          rid: msg.rid,
          type: 'diagnostics',
          diagnostics: [
            {
              code: 'unsupported',
              severity: 'warning',
              message: { th: `คำสั่ง ${msg.type} ยังไม่รองรับ`, en: `${msg.type} is not supported yet` },
            },
          ],
        });
        return;
    }
  } catch (e) {
    stop();
    const text = e instanceof Error ? e.message : String(e);
    post({
      rid: msg.rid,
      type: 'diagnostics',
      diagnostics: [{ code: 'unsupported', severity: 'error', message: { th: text, en: text } }],
    });
  }
};

/// <reference lib="webworker" />
// Web Worker ที่ถือ engine ตัวเดียว (Spec ส่วน 3, 14)
// UI ส่ง command มา ส่วน Worker ส่งค่า pin ของวงจรกลับ (และค่าทุกขาในชั้นบนสุดถ้า subscribe ไว้)

import {
  checkCondition,
  ComponentLibrary,
  compile,
  createSimulator,
  evaluateCondition,
  explainWhy,
  hasErrors,
  parseCondition,
  resetCpu,
  testComponent,
  TimeTravel,
  type CondEnv,
  type CondNode,
  type Simulator,
} from '@z-ncpu/engine';
import { Z8_ORACLE } from '@z-ncpu/isa';
import type { SignalValue, SimMode, UiToWorker, WorkerToUi } from '@z-ncpu/shared';

declare const self: DedicatedWorkerGlobalScope;

let lib = new ComponentLibrary();
let sim: Simulator | null = null;
let clockPin: string | undefined;
let simMode: SimMode = 'fast';
/** วงจรที่มี NAND เกินนี้ใช้ Fast Mode เสมอ */
const VISUAL_MAX_GATES = 3000;
let timer: ReturnType<typeof setInterval> | null = null;
/** ชั้นที่ส่งค่าของทุกขาไปด้วย (null = ไม่ส่ง) ตั้งด้วย subscribe */
let scopePath: string | null = null;

/** cycle ตอน reset CPU ครั้งล่าสุด (cycle ที่แสดง = นับจาก reset) */
let cycleBase = 0;
/** breakpoint ที่ตั้งไว้ และตัวอ่านค่าที่ใช้กับมัน */
let breakpoint: { ast: CondNode; env: CondEnv } | null = null;
/** time travel ของ simulator ตัวปัจจุบัน (Spec ส่วน 9) */
let history: TimeTravel | null = null;

/** เดินนาฬิกาหนึ่งจังหวะผ่าน time travel (บันทึก input และ keyframe) */
const tickOnce = () => (history ? history.tick() : sim!.tick(clockPin));

/** ส่งค่า NAND ทุกตัวให้มุมมอง 3D ไปกับ signals */
let watchGates = false;

// ค่าของ NAND ส่งแบบ transfer ไม่ต้องคัดลอกซ้ำ
const post = (msg: WorkerToUi): void =>
  msg.type === 'signals' && msg.gates ? self.postMessage(msg, [msg.gates.buffer]) : self.postMessage(msg);
const cycleNow = (): number => (sim ? sim.cycle - cycleBase : 0);

/**
 * ชื่อที่ใช้ใน breakpoint: ขาของวงจรบนสุด (ไม่สนตัวพิมพ์เล็กใหญ่), flags จากขา flags
 * (Z/ZF, N/NF และ CF เพราะ C คือ register C),
 * CYCLE และ net("ชิ้น.ขา") หรือ net("ชั้น/ชิ้น.ขา") ในวงจรของผู้เล่น
 */
function conditionEnv(s: Simulator, prefix: string): CondEnv {
  const pinsByName = new Map<string, string>();
  for (const name of [...s.netlist.inputs.keys(), ...s.netlist.outputs.keys()]) pinsByName.set(name.toUpperCase(), name);
  const flagBit: Record<string, number> = { Z: 2, ZF: 2, CF: 1, C: 1, N: 0, NF: 0 };
  const nets = new Map<string, Int32Array | undefined>();
  const asNum = (v: SignalValue): number | 'X' => (typeof v === 'number' ? v : 'X');
  return {
    name(raw) {
      const n = raw.toUpperCase();
      const pin = pinsByName.get(n);
      if (pin) return asNum(s.read(pin));
      if (n === 'CYCLE') return cycleNow();
      if (n in flagBit && pinsByName.has('FLAGS')) {
        const f = s.read(pinsByName.get('FLAGS')!);
        return typeof f === 'number' ? (f >> flagBit[n]!) & 1 : 'X';
      }
      return undefined;
    },
    call(fn, arg) {
      if (fn !== 'net') return undefined;
      if (!nets.has(arg)) {
        const cut = arg.lastIndexOf('/');
        const inner = cut === -1 ? '' : arg.slice(0, cut);
        const scope = [prefix, inner].filter((x) => x !== '').join('/');
        nets.set(arg, s.pinNets(scope, arg.slice(cut + 1)));
      }
      const found = nets.get(arg);
      return found ? asNum(s.readNets(found)) : undefined;
    },
  };
}

/** หยุดเองหลัง tick ถ้า CPU ถึง HALT หรือ breakpoint เป็นจริง */
function stopReason(): 'breakpoint' | 'halt' | undefined {
  if (!sim) return undefined;
  if (breakpoint && evaluateCondition(breakpoint.ast, breakpoint.env)) return 'breakpoint';
  if (sim.netlist.outputs.has('halt') && sim.read('halt') === 1) return 'halt';
  return undefined;
}

function pins(): Record<string, SignalValue> {
  if (!sim) return {};
  const out: Record<string, SignalValue> = {};
  for (const name of [...sim.netlist.inputs.keys(), ...sim.netlist.outputs.keys()]) out[name] = sim.read(name);
  return out;
}

function signals(rid: number): WorkerToUi {
  const msg: Extract<WorkerToUi, { type: 'signals' }> = { rid, type: 'signals', cycle: cycleNow(), pins: pins() };
  if (history && sim) {
    const { inputs, outputs } = sim.netlist;
    const pins = history.pins.map((name) => ({ name, width: (outputs.get(name) ?? inputs.get(name))?.length ?? 1 }));
    msg.history = { first: history.first - cycleBase, last: history.last - cycleBase, pins };
  }
  if (scopePath !== null && sim) {
    msg.scope = sim.readScope(scopePath);
    msg.scopePath = scopePath;
  }
  if (watchGates && sim) {
    const { gateY, gateCount } = sim.netlist;
    const gates = new Uint8Array(gateCount);
    for (let g = 0; g < gateCount; g++) gates[g] = sim.values[gateY[g]!]!;
    msg.gates = gates;
  }
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

/**
 * tick ทีละหลายครั้ง (หรือจนหมดเวลา budgetMs) แล้วส่งค่าออกครั้งเดียว
 * watch = หยุดเมื่อถึง breakpoint หรือ HALT แล้วแจ้งเหตุผล คืน false ถ้าต้องหยุด
 */
function step(rid: number, count: number, watch = false, budgetMs = Infinity): boolean {
  if (!sim) return false;
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    const r = tickOnce();
    if (!r.ok) {
      reportOscillation(rid, r.nets);
      return false;
    }
    const reason = watch ? stopReason() : undefined;
    if (reason) {
      stop();
      post(signals(rid));
      post({ rid, type: 'status', cycle: cycleNow(), running: false, reason });
      return false;
    }
    if (performance.now() - start > budgetMs) break;
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
        // Visual Mode ละเอียดทีละ step แต่ช้ากับวงจรใหญ่ (เช่น RAM) จึงสลับเป็น Fast Mode ให้อัตโนมัติ
        simMode = msg.mode === 'visual' && netlist && netlist.gateCount > VISUAL_MAX_GATES ? 'fast' : msg.mode;
        sim = netlist && !hasErrors(diagnostics) ? createSimulator(netlist, simMode) : null;
        cycleBase = 0;
        breakpoint = null;
        history = sim ? new TimeTravel(sim, netlist?.inputs.has('clk') ? 'clk' : undefined) : null;
        // M0: ถ้าวงจรมี input ชื่อ clk ถือว่าเป็น clock
        clockPin = netlist?.inputs.has('clk') ? 'clk' : undefined;
        post({
          rid: msg.rid,
          type: 'compiled',
          defId: msg.defId,
          mode: simMode,
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

      case 'loadPanel': {
        if (!sim) return;
        sim.loadPanel(msg.words, msg.panel);
        const r = sim.settle();
        if (!r.ok) reportOscillation(msg.rid, r.nets);
        // โปรแกรมในแผงเปลี่ยน ประวัติเดิมใช้ย้อนไม่ได้แล้ว
        history?.start();
        post(signals(msg.rid));
        return;
      }

      case 'step':
        // ทีละหลายจังหวะหยุดที่ breakpoint/HALT ได้ ทีละจังหวะเดินเสมอ
        step(msg.rid, msg.count, msg.count > 1);
        return;

      case 'run': {
        stop();
        // ส่งค่าออก ~30 ครั้งต่อวินาที ไม่ว่า hz จะเท่าไร
        // hz = Infinity (เร็วที่สุด): เดินให้มากที่สุดภายใน 25 ms ต่อเฟรม เหลือเวลาให้ตอบคำสั่งอื่น
        const frameMs = 33;
        const max = !Number.isFinite(msg.hz) || msg.hz >= 1e6;
        const perFrame = max ? 1e9 : Math.max(1, Math.round((msg.hz * frameMs) / 1000));
        const interval = msg.hz >= 30 ? frameMs : Math.round(1000 / msg.hz);
        timer = setInterval(() => {
          if (!step(msg.rid, msg.hz >= 30 ? perFrame : 1, true, max ? 25 : Infinity)) stop();
        }, interval);
        post({ rid: msg.rid, type: 'status', cycle: cycleNow(), running: true });
        return;
      }

      case 'resetCpu': {
        stop();
        if (!sim) return;
        const r = resetCpu(sim);
        cycleBase = sim.cycle;
        history?.start();
        if (!r.ok) reportOscillation(msg.rid, r.nets);
        post(signals(msg.rid));
        post({ rid: msg.rid, type: 'status', cycle: 0, running: false });
        return;
      }

      case 'breakpoint': {
        if (msg.expr === null || !sim) {
          breakpoint = null;
          post({ rid: msg.rid, type: 'breakpointSet', ok: true });
          return;
        }
        const parsed = parseCondition(msg.expr);
        if (!parsed.ok) {
          post({ rid: msg.rid, type: 'breakpointSet', ok: false, error: parsed.error });
          return;
        }
        const env = conditionEnv(sim, msg.scopePrefix ?? '');
        const unknown = checkCondition(parsed.ast, env);
        if (unknown) {
          post({ rid: msg.rid, type: 'breakpointSet', ok: false, error: unknown });
          return;
        }
        breakpoint = { ast: parsed.ast, env };
        post({ rid: msg.rid, type: 'breakpointSet', ok: true });
        return;
      }

      case 'pause':
        stop();
        post({ rid: msg.rid, type: 'status', cycle: cycleNow(), running: false });
        return;

      case 'reset':
        stop();
        if (sim) sim = createSimulator(sim.netlist, simMode);
        cycleBase = 0;
        breakpoint = null;
        history = sim ? new TimeTravel(sim, clockPin) : null;
        post(signals(msg.rid));
        post({ rid: msg.rid, type: 'status', cycle: 0, running: false });
        return;

      case 'test': {
        const { report, diagnostics } = testComponent(lib, msg.defId, msg.tests, msg.mode, undefined, Z8_ORACLE);
        post({ rid: msg.rid, type: 'testResult', defId: msg.defId, mode: msg.mode, report, diagnostics });
        return;
      }

      case 'subscribe':
        scopePath = msg.scopePath;
        post({ rid: msg.rid, type: 'status', cycle: cycleNow(), running: timer !== null });
        if (sim) post(signals(msg.rid));
        return;

      case 'gateMap':
        post({ rid: msg.rid, type: 'gateMap', paths: sim ? sim.netlist.gatePath : [] });
        return;

      case 'watchGates':
        watchGates = msg.on;
        if (sim) post(signals(msg.rid));
        return;

      case 'seek': {
        stop();
        if (!sim || !history) return;
        const r = history.seek(cycleBase + msg.cycle);
        if (!r.ok) reportOscillation(msg.rid, r.nets);
        post(signals(msg.rid));
        post({ rid: msg.rid, type: 'status', cycle: cycleNow(), running: false });
        return;
      }

      case 'trace': {
        const columns: Record<string, (number | null)[]> = {};
        const from = Math.max(0, Math.floor(msg.from));
        const to = Math.min(from + 4096, Math.floor(msg.to));
        if (history) for (const pin of msg.pins.slice(0, 32)) columns[pin] = history.read(pin, cycleBase + from, cycleBase + to);
        post({ rid: msg.rid, type: 'traceData', from, to, columns });
        return;
      }

      case 'why':
        post({ rid: msg.rid, type: 'whyResult', result: sim ? explainWhy(sim, msg.scope, msg.key) : null });
        return;

      case 'probe':
        // probe แยกยังไม่ใช้ (X-Ray แสดงค่าทุกขาอยู่แล้ว)
        post({
          rid: msg.rid,
          type: 'diagnostics',
          diagnostics: [{ code: 'unsupported', severity: 'warning', message: { th: 'คำสั่ง probe ยังไม่รองรับ', en: 'probe is not supported yet' } }],
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

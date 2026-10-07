// Time travel (Spec ส่วน 9): keyframe ค่าทุก net ทุก N cycle + บันทึก input ทุก cycle + จำลองซ้ำแบบ deterministic
// ย้อนไป cycle ใดก็ได้ = โหลด keyframe ที่ใกล้ที่สุดก่อนหน้า แล้วเดินนาฬิกาต่อด้วย input ที่บันทึกไว้
// พร้อมกันนั้นเก็บค่าขาของวงจรบนสุดทุก cycle ไว้ให้ Logic Analyzer วาด timing diagram
// ใช้หน่วยความจำไม่เกินงบ (ค่าเริ่มต้น 64 MB) ถ้าเกินจะทิ้งช่วงเก่าที่สุดทีละ keyframe

import type { SignalValue } from '@z-ncpu/shared';
import type { SettleResult, Simulator } from './sim/base';

export interface TimeTravelOptions {
  /** เก็บ keyframe ทุกกี่ cycle (ค่าเริ่มต้น 256) */
  keyframeEvery?: number;
  /** งบหน่วยความจำเป็น byte (ค่าเริ่มต้น 64 MB) */
  budgetBytes?: number;
}

/** จำนวน cycle ต่อก้อนของข้อมูลแต่ละขา */
const CHUNK = 4096;
/** ขาที่กว้างเกินนี้ไม่บันทึก (เช่นมัดสายโปรแกรม) */
const MAX_PIN_BITS = 32;

/** ค่าของขาหนึ่งตามเวลา เก็บเป็นก้อนละ CHUNK cycle (NaN = X) */
class Column {
  private chunks: (Float64Array | undefined)[] = [];
  set(i: number, v: number): void {
    const c = Math.floor(i / CHUNK);
    let chunk = this.chunks[c];
    if (!chunk) chunk = this.chunks[c] = new Float64Array(CHUNK).fill(NaN);
    chunk[i % CHUNK] = v;
  }
  get(i: number): number {
    return this.chunks[Math.floor(i / CHUNK)]?.[i % CHUNK] ?? NaN;
  }
  /** ทิ้งก้อนที่อยู่ก่อน index นี้ทั้งก้อน */
  dropBefore(i: number): void {
    const last = Math.min(this.chunks.length, Math.floor(i / CHUNK));
    for (let c = 0; c < last; c++) this.chunks[c] = undefined;
  }
  clear(): void {
    this.chunks = [];
  }
}

const toNum = (v: SignalValue): number => (typeof v === 'number' ? v : NaN);

export class TimeTravel {
  readonly every: number;
  readonly budget: number;
  /** cycle ที่เริ่มบันทึก (index 0 ของ Column) */
  private origin = 0;
  /** cycle เก่าสุดที่ยังย้อนไปได้ */
  first = 0;
  /** cycle ล่าสุดที่บันทึกไว้ (อาจมากกว่า sim.cycle ถ้าย้อนกลับไปดูอยู่) */
  last = 0;
  private readonly keyframes = new Map<number, Uint8Array>();
  /** ค่าขาออก (และขาเข้า) หลังแต่ละ cycle */
  private readonly columns = new Map<string, Column>();
  /** ค่าขาเข้าตอนเดินนาฬิกาจาก cycle c ไป c+1 (ใช้จำลองซ้ำ) */
  private readonly inputCols = new Map<string, Column>();
  readonly pins: string[];
  readonly inputs: string[];

  constructor(
    readonly sim: Simulator,
    readonly clock?: string,
    options: TimeTravelOptions = {},
  ) {
    this.every = Math.max(1, options.keyframeEvery ?? 256);
    this.budget = options.budgetBytes ?? 64 * 1024 * 1024;
    const { inputs, outputs } = sim.netlist;
    const narrow = (m: Map<string, Int32Array>): string[] => [...m].filter(([, n]) => n.length <= MAX_PIN_BITS).map(([k]) => k);
    this.inputs = narrow(inputs).filter((n) => n !== clock);
    this.pins = [...narrow(outputs), ...this.inputs];
    for (const p of narrow(outputs)) this.columns.set(p, new Column());
    for (const p of this.inputs) this.inputCols.set(p, new Column());
    this.start();
  }

  /** เริ่มบันทึกใหม่จากสถานะตอนนี้ (หลัง reset หรือเปลี่ยนโปรแกรมในแผง) */
  start(): void {
    this.keyframes.clear();
    for (const c of this.columns.values()) c.clear();
    for (const c of this.inputCols.values()) c.clear();
    this.origin = this.first = this.last = this.sim.cycle;
    this.keyframes.set(this.sim.cycle, this.sim.saveState());
    this.recordRow();
  }

  /** ตอนนี้กำลังดู cycle ในอดีตอยู่หรือไม่ */
  get inPast(): boolean {
    return this.sim.cycle < this.last;
  }

  /** เดินนาฬิกาหนึ่งจังหวะและบันทึก ถ้ากำลังดูอดีตอยู่ ประวัติหลังจากนี้ถูกตัดทิ้ง (แตกเส้นเวลาใหม่) */
  tick(): SettleResult {
    const { sim } = this;
    if (sim.cycle < this.last) this.truncate(sim.cycle);
    const at = sim.cycle - this.origin;
    for (const name of this.inputs) this.inputCols.get(name)!.set(at, toNum(sim.read(name)));
    const r = sim.tick(this.clock);
    if (!r.ok) return r;
    this.last = sim.cycle;
    this.recordRow();
    if ((sim.cycle - this.origin) % this.every === 0) {
      this.keyframes.set(sim.cycle, sim.saveState());
      this.enforceBudget();
    }
    return r;
  }

  /** ย้อนหรือเดินหน้าไป cycle ที่ต้องการ (อยู่ในช่วง first..last) */
  seek(target: number): SettleResult {
    const t = Math.max(this.first, Math.min(this.last, Math.round(target)));
    let k = t;
    while (k > this.first && !this.keyframes.has(k)) k--;
    const frame = this.keyframes.get(k);
    if (!frame) throw new Error(`ไม่มี keyframe ที่ cycle ${k}`);
    // จำค่าขาเข้าปัจจุบันไว้ใส่กลับหลังจำลองซ้ำ (สวิตช์บนจอยังเป็นค่าที่ผู้ใช้ตั้งอยู่)
    const live = this.inputs.map((n) => [n, this.sim.read(n)] as const);
    this.sim.restoreState(frame, k);
    let r: SettleResult = { ok: true, steps: 0 };
    for (let c = k; c < t && r.ok; c++) {
      for (const name of this.inputs) {
        const v = this.inputCols.get(name)!.get(c - this.origin);
        this.sim.setInput(name, Number.isNaN(v) ? 'X' : v);
      }
      r = this.sim.tick(this.clock);
    }
    for (const [n, v] of live) this.sim.setInput(n, v);
    return r.ok ? this.sim.settle() : r;
  }

  /**
   * ค่าของขาตั้งแต่ cycle from ถึง to (รวมปลาย) null = X หรือไม่มีข้อมูล
   * ขาออก = ค่าหลังเข้าสู่ cycle นั้น, ขาเข้า = ค่าที่ใส่อยู่ระหว่าง cycle นั้น (ใช้ตอนเดินนาฬิกาไป cycle ถัดไป)
   */
  read(pin: string, from: number, to: number): (number | null)[] {
    const out = this.columns.get(pin);
    const input = this.inputCols.get(pin);
    const res: (number | null)[] = [];
    for (let c = from; c <= to; c++) {
      let v = NaN;
      if (c >= this.first && c <= this.last) {
        if (out) v = out.get(c - this.origin);
        else if (input) v = c === this.last && !this.inPast ? toNum(this.sim.read(pin)) : input.get(c - this.origin);
      }
      res.push(Number.isNaN(v) ? null : v);
    }
    return res;
  }

  /** หน่วยความจำที่ใช้โดยประมาณ (byte) */
  get bytes(): number {
    const cycles = this.last - this.first + CHUNK;
    return this.keyframes.size * this.sim.values.length + cycles * (this.columns.size + this.inputCols.size) * 8;
  }

  private recordRow(): void {
    const at = this.sim.cycle - this.origin;
    for (const [name, col] of this.columns) col.set(at, toNum(this.sim.read(name)));
  }

  private truncate(cycle: number): void {
    for (const k of [...this.keyframes.keys()]) if (k > cycle) this.keyframes.delete(k);
    this.last = cycle;
  }

  /** เกินงบ: ทิ้ง keyframe เก่าสุด แล้วเลื่อน first ไปที่ keyframe ถัดไป */
  private enforceBudget(): void {
    while (this.bytes > this.budget && this.keyframes.size > 1) {
      const keys = [...this.keyframes.keys()].sort((a, b) => a - b);
      this.keyframes.delete(keys[0]!);
      this.first = keys[1]!;
      for (const c of this.columns.values()) c.dropBefore(this.first - this.origin);
      for (const c of this.inputCols.values()) c.dropBefore(this.first - this.origin);
    }
  }
}

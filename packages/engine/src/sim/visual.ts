import type { Bit } from '@z-ncpu/shared';
import type { Netlist } from '../flatten';
import { NAND_TABLE } from '../logic';
import { Simulator, type SettleResult } from './base';

export interface VisualOptions {
  /** step สูงสุดต่อการ settle หนึ่งครั้ง เกินแล้วถือว่า oscillation */
  maxSettleSteps?: number;
  /** เก็บ net ที่เปลี่ยนในแต่ละ step ของการ settle ครั้งล่าสุด (ใช้เล่นภาพไฟวิ่ง) */
  recordTrace?: boolean;
}

/**
 * Visual Mode: event-driven แบบ unit delay (Spec ส่วน 6.3)
 * net ที่เปลี่ยนใน step t ทำให้เกตปลายทางคำนวณใหม่ และผลไปมีผลใน step t+1
 */
export class VisualSimulator extends Simulator {
  readonly maxSettleSteps: number;
  /** trace[step] = net ที่เปลี่ยนใน step นั้น */
  lastTrace: Int32Array[] = [];
  private readonly recordTrace: boolean;
  private readonly dirty: Uint8Array;
  private readonly dirtyList: Int32Array;
  private dirtyCount = 0;
  private readonly changedNets: Int32Array;
  private readonly changedVals: Uint8Array;

  constructor(netlist: Netlist, options: VisualOptions = {}) {
    super(netlist);
    this.maxSettleSteps = options.maxSettleSteps ?? 100_000;
    this.recordTrace = options.recordTrace ?? false;
    this.dirty = new Uint8Array(netlist.gateCount);
    this.dirtyList = new Int32Array(netlist.gateCount);
    this.changedNets = new Int32Array(netlist.gateCount);
    this.changedVals = new Uint8Array(netlist.gateCount);
    this.initDrivenNets();
    // ทุกเกตคำนวณหนึ่งรอบตอนเริ่ม เพื่อให้ค่าที่หาได้จากค่าคงที่ไหลออกไป
    for (let g = 0; g < netlist.gateCount; g++) this.markGate(g);
    this.settle();
  }

  protected writeNet(net: number, value: Bit): void {
    if (this.values[net] === value) return;
    this.values[net] = value;
    this.markFanout(net);
  }

  protected propagate(): SettleResult {
    const { gateA, gateB, gateY } = this.netlist;
    const values = this.values;
    let steps = 0;
    if (this.recordTrace) this.lastTrace = [];

    while (this.dirtyCount > 0) {
      if (steps >= this.maxSettleSteps) {
        const nets = this.pendingChanges();
        this.clearDirty();
        return { ok: false, reason: 'oscillation', steps, nets };
      }
      steps++;
      let n = 0;
      for (let i = 0; i < this.dirtyCount; i++) {
        const g = this.dirtyList[i] as number;
        this.dirty[g] = 0;
        const y = gateY[g] as number;
        const nv = NAND_TABLE[(values[gateA[g] as number] as number) * 3 + (values[gateB[g] as number] as number)] as number;
        if (nv !== values[y]) {
          this.changedNets[n] = y;
          this.changedVals[n] = nv;
          n++;
        }
      }
      this.dirtyCount = 0;
      // อัปเดตพร้อมกันทุกเกต = ความหน่วงเท่ากันเกตละ 1 step
      for (let j = 0; j < n; j++) {
        const net = this.changedNets[j] as number;
        if (values[net] !== this.changedVals[j]) {
          values[net] = this.changedVals[j] as number;
          this.markFanout(net);
        }
      }
      if (this.recordTrace) this.lastTrace.push(this.changedNets.slice(0, n));
    }
    return { ok: true, steps };
  }

  private markGate(g: number): void {
    if (this.dirty[g]) return;
    this.dirty[g] = 1;
    this.dirtyList[this.dirtyCount++] = g;
  }

  private markFanout(net: number): void {
    const { fanoutStart, fanoutGates } = this.netlist;
    for (let k = fanoutStart[net] as number, end = fanoutStart[net + 1] as number; k < end; k++) {
      this.markGate(fanoutGates[k] as number);
    }
  }

  /** net ที่จะเปลี่ยนใน step ถัดไป ใช้บอกว่าส่วนไหนของวงจรยังสลับค่าไม่หยุด */
  private pendingChanges(): number[] {
    const { gateA, gateB, gateY } = this.netlist;
    const nets = new Set<number>();
    for (let i = 0; i < this.dirtyCount; i++) {
      const g = this.dirtyList[i] as number;
      const nv = NAND_TABLE[(this.values[gateA[g] as number] as number) * 3 + (this.values[gateB[g] as number] as number)];
      if (nv !== this.values[gateY[g] as number]) nets.add(gateY[g] as number);
    }
    return [...nets].sort((a, b) => a - b);
  }

  private clearDirty(): void {
    for (let i = 0; i < this.dirtyCount; i++) this.dirty[this.dirtyList[i] as number] = 0;
    this.dirtyCount = 0;
  }
}

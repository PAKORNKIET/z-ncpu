import type { Bit } from '@z-ncpu/shared';
import type { Netlist } from '../flatten';
import { NAND_TABLE } from '../logic';
import { Simulator, type SettleResult } from './base';
import { buildSchedule, type Schedule } from './schedule';

export interface FastOptions {
  /** รอบสูงสุดที่วนคำนวณกลุ่มที่มี loop ก่อนถือว่า oscillation */
  maxLoopRounds?: number;
}

/**
 * Fast Mode: compile ลำดับเกตครั้งเดียว แล้วคำนวณไล่ตามลำดับ (Spec ส่วน 6.4)
 * รันเกตชุดเดียวกับ Visual Mode ไม่ได้สลับไปใช้ CPU จำลองที่เขียนแยกไว้
 * ไม่สร้างโค้ด JS จากข้อมูลผู้ใช้ ทุกอย่างอยู่ใน typed array
 */
export class FastSimulator extends Simulator {
  readonly schedule: Schedule;
  readonly maxLoopRounds: number;

  constructor(netlist: Netlist, options: FastOptions = {}) {
    super(netlist);
    this.maxLoopRounds = options.maxLoopRounds ?? 64;
    this.schedule = buildSchedule(netlist);
    this.initDrivenNets();
    this.settle();
  }

  protected writeNet(net: number, value: Bit): void {
    this.values[net] = value;
  }

  protected propagate(): SettleResult {
    const { gateA, gateB, gateY } = this.netlist;
    const { order, groupStart, groupLoop, groupCount } = this.schedule;
    const values = this.values;
    let evals = 0;

    for (let grp = 0; grp < groupCount; grp++) {
      const start = groupStart[grp] as number;
      const end = groupStart[grp + 1] as number;
      if (!groupLoop[grp]) {
        const g = order[start] as number;
        values[gateY[g] as number] =
          NAND_TABLE[(values[gateA[g] as number] as number) * 3 + (values[gateB[g] as number] as number)] as number;
        evals++;
        continue;
      }
      // กลุ่มที่มี loop: วนคำนวณจนไม่มีอะไรเปลี่ยน
      let rounds = 0;
      let changed = true;
      while (changed) {
        if (rounds >= this.maxLoopRounds) {
          return { ok: false, reason: 'oscillation', steps: evals, nets: this.unstableNets(start, end) };
        }
        changed = false;
        rounds++;
        for (let i = start; i < end; i++) {
          const g = order[i] as number;
          const y = gateY[g] as number;
          const nv = NAND_TABLE[(values[gateA[g] as number] as number) * 3 + (values[gateB[g] as number] as number)] as number;
          if (nv !== values[y]) {
            values[y] = nv;
            changed = true;
          }
        }
        evals += end - start;
      }
    }
    return { ok: true, steps: evals };
  }

  private unstableNets(start: number, end: number): number[] {
    const { gateA, gateB, gateY } = this.netlist;
    const nets: number[] = [];
    for (let i = start; i < end; i++) {
      const g = this.schedule.order[i] as number;
      const nv = NAND_TABLE[(this.values[gateA[g] as number] as number) * 3 + (this.values[gateB[g] as number] as number)];
      if (nv !== this.values[gateY[g] as number]) nets.push(gateY[g] as number);
    }
    return nets.sort((a, b) => a - b);
  }
}

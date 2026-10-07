import type { Bit, SignalValue } from '@z-ncpu/shared';
import type { Netlist, PanelInfo } from '../flatten';
import { X } from '../logic';

export type SettleResult =
  | { ok: true; steps: number }
  | { ok: false; reason: 'oscillation'; steps: number; nets: number[] };

/** ส่วนที่ Visual Mode กับ Fast Mode ใช้ร่วมกัน: อ่าน/เขียน pin และ clock tick */
export abstract class Simulator {
  readonly values: Uint8Array;
  /** จำนวน clock tick ที่ผ่านไปแล้ว */
  cycle = 0;

  constructor(readonly netlist: Netlist) {
    this.values = new Uint8Array(netlist.netCount).fill(X);
  }

  /** เขียนค่าลง net ที่ถูกขับจากภายนอก (input, const, clock) */
  protected abstract writeNet(net: number, value: Bit): void;

  /**
   * ให้ subclass เรียกหลังเตรียมโครงสร้างของตัวเองเสร็จ: ใส่ค่าคงที่ ให้ prim.clock เริ่มที่ 0
   * และแผงค่าคงที่เริ่มเป็น 0 ทุกบิต (โปรแกรมว่าง = NOP ทั้งหมดใน Z8)
   */
  protected initDrivenNets(): void {
    const { constNets, constValues, clockNets, panels } = this.netlist;
    constNets.forEach((net, i) => this.writeNet(net, constValues[i] as Bit));
    clockNets.forEach((net) => this.writeNet(net, 0));
    for (const p of panels) for (const net of p.nets) this.writeNet(net, 0);
  }

  /** มี input ที่ถูกเขียนแต่ยังไม่ได้ settle */
  private inputsPending = false;

  /** คำนวณจนสัญญาณนิ่ง (ให้แต่ละโหมด implement) */
  protected abstract propagate(): SettleResult;

  /** คำนวณจนสัญญาณนิ่ง */
  settle(): SettleResult {
    this.inputsPending = false;
    return this.propagate();
  }

  setInput(name: string, value: SignalValue): void {
    const nets = this.netlist.inputs.get(name);
    if (!nets) throw new Error(`ไม่มี input ชื่อ "${name}"`);
    const bits = toBits(value, nets.length);
    for (let i = 0; i < nets.length; i++) this.writeNet(nets[i] as number, bits[i] as Bit);
    this.inputsPending = true;
  }

  /**
   * ตั้งค่าแผงค่าคงที่ตามโปรแกรม (Spec ส่วน 11) คำที่ไม่ได้ระบุจะเป็น 0
   * panel = path ของแผง หรือลำดับในวงจร; ค่าเริ่มต้นคือแผงแรก
   */
  loadPanel(words: ArrayLike<number>, panel: string | number = 0): void {
    const info = this.findPanel(panel);
    if (words.length > info.words) {
      throw new RangeError(`โปรแกรมยาว ${words.length} คำ แต่แผง ${info.path} จุได้ ${info.words} คำ`);
    }
    for (let i = 0; i < info.words; i++) {
      const word = i < words.length ? (words[i] as number) : 0;
      const bits = toBits(word, info.width);
      for (let j = 0; j < info.width; j++) this.writeNet(info.nets[i * info.width + j] as number, bits[j] as Bit);
    }
    this.inputsPending = true;
  }

  private findPanel(panel: string | number): PanelInfo {
    const { panels } = this.netlist;
    const info = typeof panel === 'number' ? panels[panel] : panels.find((p) => p.path === panel);
    if (!info) throw new Error(`ไม่มีแผงค่าคงที่ ${String(panel)} ในวงจรนี้`);
    return info;
  }

  /** อ่านค่า pin ทีละบิต (บิต 0 = LSB) ใช้กับมัดสายที่กว้างเกินจะแทนเป็นตัวเลขได้ */
  readBits(name: string): Bit[] {
    const nets = this.netlist.outputs.get(name) ?? this.netlist.inputs.get(name);
    if (!nets) throw new Error(`ไม่มี pin ชื่อ "${name}"`);
    return Array.from(nets, (n) => this.values[n] as Bit);
  }

  /** อ่านค่า pin (input หรือ output) ได้ 'X' ถ้ามีบิตใดยังไม่รู้ค่า; pin ที่กว้างเกิน 32 บิตให้ใช้ readBits */
  read(name: string): SignalValue {
    const nets = this.netlist.outputs.get(name) ?? this.netlist.inputs.get(name);
    if (!nets) throw new Error(`ไม่มี pin ชื่อ "${name}"`);
    if (nets.length > 32) throw new RangeError(`pin "${name}" กว้าง ${nets.length} บิต ให้อ่านด้วย readBits`);
    return this.valueOf(nets);
  }

  /**
   * ค่าของขาทุกขาในชั้นหนึ่ง สำหรับระบายสีสายบนหน้าจอและ X-Ray
   * scope '' = ชั้นบนสุด, 'not1' = ข้างในชิ้น not1, 'fa2/xor1' = ข้างใน xor1 ที่อยู่ใน fa2
   * key = "ชื่อชิ้น.ชื่อขา" และ "self.ชื่อขา" สำหรับขาของวงจรในชั้นนั้นเอง
   * ขาที่กว้างเกิน 32 บิต (มัดสาย) ได้ค่าสรุป: 'X' ถ้ามีบิตที่ไม่รู้ค่า, 1 ถ้ามีบิตใดเป็น 1, ไม่งั้น 0
   * ชั้นที่ไม่มีอยู่ (หรือเป็น primitive) ได้ object ว่าง
   */
  readScope(scope = ''): Record<string, SignalValue> {
    const out: Record<string, SignalValue> = {};
    const { inputs, outputs, scopes, nodeNet } = this.netlist;
    const nets = (nodes: number[]): Int32Array => Int32Array.from(nodes, (n) => nodeNet[n] as number);
    if (scope === '') {
      for (const [name, n] of inputs) out[`self.${name}`] = this.summary(n);
      for (const [name, n] of outputs) out[`self.${name}`] = this.summary(n);
    } else {
      // ขาของชิ้นนี้อยู่ในชั้นแม่ เช่น scope "fa2/xor1" → ชั้น "fa2" ชิ้น "xor1"
      const cut = scope.lastIndexOf('/');
      const id = scope.slice(cut + 1);
      const me = scopes.get(cut === -1 ? '' : scope.slice(0, cut))?.find((i) => i.id === id);
      if (!me) return out;
      for (const [pin, nodes] of me.pins) out[`self.${pin}`] = this.summary(nets(nodes));
    }
    for (const inst of scopes.get(scope) ?? []) {
      for (const [pin, nodes] of inst.pins) out[`${inst.id}.${pin}`] = this.summary(nets(nodes));
    }
    return out;
  }

  /**
   * nets ของขาหนึ่ง: key = "ชิ้น.ขา" ในชั้น scope หรือ "self.ขา" (ใช้กับ net("...") ของ breakpoint)
   * หาไว้ครั้งเดียวแล้วอ่านซ้ำด้วย readNets ได้เร็ว
   */
  pinNets(scope: string, key: string): Int32Array | undefined {
    const { inputs, outputs, scopes, nodeNet } = this.netlist;
    const dot = key.lastIndexOf('.');
    if (dot <= 0) return undefined;
    const inst = key.slice(0, dot);
    const pin = key.slice(dot + 1);
    const nets = (nodes: number[]): Int32Array => Int32Array.from(nodes, (n) => nodeNet[n] as number);
    if (inst === 'self') {
      if (scope === '') {
        const n = inputs.get(pin) ?? outputs.get(pin);
        return n ? Int32Array.from(n) : undefined;
      }
      const cut = scope.lastIndexOf('/');
      const me = scopes.get(cut === -1 ? '' : scope.slice(0, cut))?.find((i) => i.id === scope.slice(cut + 1));
      const nodes = me?.pins.get(pin);
      return nodes ? nets(nodes) : undefined;
    }
    const nodes = scopes.get(scope)?.find((i) => i.id === inst)?.pins.get(pin);
    return nodes ? nets(nodes) : undefined;
  }

  /** ค่าของกลุ่ม net (บิต 0 = ตัวแรก) ถ้ากว้างเกิน 32 บิตคืน 1 เมื่อมีบิตใดเป็น 1 */
  readNets(nets: Int32Array): SignalValue {
    return this.summary(nets);
  }

  private summary(nets: Int32Array): SignalValue {
    if (nets.length <= 32) return this.valueOf(nets);
    let any = 0;
    for (const n of nets) {
      const b = this.values[n];
      if (b === X) return 'X';
      any |= b as number;
    }
    return any;
  }

  private valueOf(nets: Int32Array): SignalValue {
    let v = 0;
    for (let i = 0; i < nets.length; i++) {
      const b = this.values[nets[i] as number];
      if (b === X) return 'X';
      if (b === 1) v += 2 ** i;
    }
    return v;
  }

  readNet(net: number): Bit {
    return this.values[net] as Bit;
  }

  /**
   * 1 tick = CLK เป็น 1 → settle → CLK เป็น 0 → settle (Spec ส่วน 6.5)
   * ขับทั้ง input ที่ชื่อ clock และ prim.clock ทุกตัวในวงจร
   * ก่อนขอบขาขึ้น input ที่เพิ่งเขียนจะถูก settle ให้นิ่งก่อน (setup time เหมือนฮาร์ดแวร์จริง)
   * และถ้า clock ยังไม่เป็น 0 (เช่นยังเป็น X ตอนเริ่ม) จะดึงลง 0 ก่อน ขอบขาขึ้นจึงเป็น 0 → 1 จริงเสมอ
   */
  tick(clock?: string): SettleResult {
    let steps = 0;
    if (this.inputsPending) {
      const rs = this.settle();
      if (!rs.ok) return rs;
      steps += rs.steps;
    }
    if (this.clockLevel(clock) !== 0) {
      const r0 = this.driveClock(clock, 0);
      if (!r0.ok) return r0;
      steps += r0.steps;
    }
    const r1 = this.driveClock(clock, 1);
    if (!r1.ok) return r1;
    const r2 = this.driveClock(clock, 0);
    if (!r2.ok) return r2;
    this.cycle++;
    return { ok: true, steps: steps + r1.steps + r2.steps };
  }

  private clockLevel(clock: string | undefined): Bit {
    const net = clock !== undefined ? this.netlist.inputs.get(clock)?.[0] : this.netlist.clockNets[0];
    return net === undefined ? 0 : (this.values[net] as Bit);
  }

  private driveClock(clock: string | undefined, value: Bit): SettleResult {
    if (clock !== undefined) {
      const nets = this.netlist.inputs.get(clock);
      if (!nets) throw new Error(`ไม่มี input clock ชื่อ "${clock}"`);
      for (const net of nets) this.writeNet(net, value);
    }
    for (const net of this.netlist.clockNets) this.writeNet(net, value);
    return this.settle();
  }
}

export function toBits(value: SignalValue, width: number): Bit[] {
  if (value === 'X') return new Array<Bit>(width).fill(X);
  if (width > 32) throw new RangeError(`ใส่ค่าเป็นตัวเลขได้กับ pin ไม่เกิน 32 บิต (pin นี้กว้าง ${width} บิต)`);
  if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) {
    throw new RangeError(`ค่า ${value} ใส่ใน ${width} บิตไม่ได้`);
  }
  const bits: Bit[] = [];
  for (let i = 0; i < width; i++) bits.push((Math.floor(value / 2 ** i) % 2) as Bit);
  return bits;
}

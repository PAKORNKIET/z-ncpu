import type { ComponentDef, Instance, LocalizedText, PinDef, PinRef, Wire } from '@z-ncpu/shared';

export const inp = (name: string, width = 1): PinDef => ({ name, dir: 'in', width });
export const out = (name: string, width = 1): PinDef => ({ name, dir: 'out', width });

/**
 * สร้าง ComponentDef ด้วยโค้ด ใช้กับเทสต์ เฉลยอ้างอิง และ demo
 * ปลายสายเขียนเป็น "inst.pin" และใช้ "self.pin" สำหรับ pin ของวงจรนี้เอง
 */
export class CircuitBuilder {
  private readonly instances: Instance[] = [];
  private readonly wires: Wire[] = [];
  private counter = 0;

  constructor(
    private readonly id: string,
    private readonly name: LocalizedText,
    private readonly pins: PinDef[],
  ) {}

  add(defId: string, opts: { id?: string; params?: Record<string, number> } = {}): string {
    const n = this.instances.length;
    const id = opts.id ?? `${defId.split('.').pop() ?? 'i'}${++this.counter}`;
    const inst: Instance = { id, defId, x: (n % 8) * 120, y: Math.floor(n / 8) * 96, rotation: 0 };
    if (opts.params) inst.params = { ...opts.params };
    this.instances.push(inst);
    return id;
  }

  wire(from: string, to: string): this {
    this.wires.push({ id: `w${this.wires.length + 1}`, from: parseRef(from), to: parseRef(to) });
    return this;
  }

  build(): ComponentDef {
    return {
      id: this.id,
      name: this.name,
      kind: 'circuit',
      pins: this.pins.map((p) => ({ ...p })),
      body: { instances: [...this.instances], wires: [...this.wires] },
    };
  }
}

export function circuit(id: string, name: LocalizedText | string, pins: PinDef[]): CircuitBuilder {
  const text = typeof name === 'string' ? { th: name, en: name } : name;
  return new CircuitBuilder(id, text, pins);
}

function parseRef(ref: string): PinRef {
  const dot = ref.lastIndexOf('.');
  if (dot <= 0 || dot === ref.length - 1) throw new Error(`ปลายสายต้องเป็นรูปแบบ "inst.pin": ${ref}`);
  return { inst: ref.slice(0, dot), pin: ref.slice(dot + 1) };
}

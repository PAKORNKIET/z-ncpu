// ทดสอบขนาด (Spec ข้อ 6): วงจรระดับ RAM256 ต้อง compile และรันใน Fast Mode ได้
import { describe, expect, it } from 'vitest';
import { circuit, compile, createSimulator, inp, out } from '../src';
import { referenceLibrary } from '../fixtures/reference';

/** shift register 8 บิต × N ชั้น ใช้ Register 1 บิตของผู้เล่น (13 NAND ต่อบิต) */
function shiftRegisterLibrary(stages: number) {
  const lib = referenceLibrary();
  const b = circuit('bench.shift', 'Shift register', [inp('d', 8), inp('clk'), out('q', 8)]);
  const one = b.add('prim.const1');
  let prev = 'self.d';
  for (let s = 0; s < stages; s++) {
    const split = b.add('prim.split', { params: { width: 8 } });
    const merge = b.add('prim.merge', { params: { width: 8 } });
    b.wire(prev, `${split}.in`);
    for (let i = 0; i < 8; i++) {
      const bit = b.add('user.bit');
      b.wire(`${split}.b${i}`, `${bit}.in`).wire(`${one}.y`, `${bit}.load`).wire('self.clk', `${bit}.clk`);
      b.wire(`${bit}.out`, `${merge}.b${i}`);
    }
    prev = `${merge}.out`;
  }
  b.wire(prev, 'self.q');
  lib.add(b.build());
  return lib;
}

describe('ขนาดวงจรระดับ CPU', () => {
  it('2,000 บิต (ขนาดใกล้ RAM256) หรือ 26,000 NAND: compile ได้ และข้อมูลไหลถูกต้องใน Fast Mode', () => {
    const stages = 250;
    const t0 = performance.now();
    const { netlist, diagnostics } = compile(shiftRegisterLibrary(stages), 'bench.shift');
    const compileMs = performance.now() - t0;
    expect(diagnostics).toEqual([]);
    expect(netlist?.gateCount).toBe(stages * 8 * 13);

    const t1 = performance.now();
    const sim = createSimulator(netlist!, 'fast');
    const scheduleMs = performance.now() - t1;

    // ป้อนค่า 1..250 (ไม่ซ้ำกัน) ทีละ tick แล้วค่าแรกต้องออกปลายทางหลัง stages tick
    const t2 = performance.now();
    for (let i = 0; i < stages; i++) {
      sim.setInput('d', i + 1);
      expect(sim.tick('clk').ok).toBe(true);
    }
    const runMs = performance.now() - t2;
    expect(sim.read('q')).toBe(1);
    sim.setInput('d', 0);
    sim.tick('clk');
    expect(sim.read('q')).toBe(2);

    const ticksPerSec = Math.round(stages / (runMs / 1000));
    console.info(
      `[scale] ${netlist!.gateCount} NAND · compile ${compileMs.toFixed(0)} ms · schedule ${scheduleMs.toFixed(0)} ms · ${ticksPerSec} tick/s`,
    );
  }, 60_000);
});

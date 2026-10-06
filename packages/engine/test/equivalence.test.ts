// Property test (Spec ส่วน 6.6): สองโหมดต้องให้ผลเท่ากันบนวงจรสุ่ม
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { circuit, compile, ComponentLibrary, createSimulator, inp, out } from '../src';

interface RandomDag {
  inputs: number;
  /** เกตแต่ละตัวเลือก source จาก input หรือเกตก่อนหน้า (ดัชนี) */
  gates: [number, number][];
  outputs: number;
}

const dagArb = fc
  .record({ inputs: fc.integer({ min: 1, max: 5 }), gateCount: fc.integer({ min: 1, max: 40 }), outputs: fc.integer({ min: 1, max: 4 }) })
  .chain(({ inputs, gateCount, outputs }) =>
    fc
      .tuple(
        ...Array.from({ length: gateCount }, (_, g) =>
          fc.tuple(fc.integer({ min: 0, max: inputs + g - 1 }), fc.integer({ min: 0, max: inputs + g - 1 })),
        ),
      )
      .map((gates) => ({ inputs, gates: gates as [number, number][], outputs: Math.min(outputs, gateCount) })),
  );

function buildDag(dag: RandomDag): ComponentLibrary {
  const pins = [
    ...Array.from({ length: dag.inputs }, (_, i) => inp(`i${i}`)),
    ...Array.from({ length: dag.outputs }, (_, i) => out(`o${i}`)),
  ];
  const b = circuit('rand.dag', 'random', pins);
  const ids: string[] = [];
  const src = (k: number): string => (k < dag.inputs ? `self.i${k}` : `${ids[k - dag.inputs]}.y`);
  dag.gates.forEach(([a, c]) => {
    const id = b.add('prim.nand');
    b.wire(src(a), `${id}.a`).wire(src(c), `${id}.b`);
    ids.push(id);
  });
  for (let o = 0; o < dag.outputs; o++) b.wire(`${ids[ids.length - 1 - o]}.y`, `self.o${o}`);
  return new ComponentLibrary([b.build()]);
}

describe('Visual Mode = Fast Mode', () => {
  it('วงจร combinational สุ่ม ให้ผลเท่ากันทุก input', () => {
    fc.assert(
      fc.property(dagArb, (dag) => {
        const { netlist } = compile(buildDag(dag), 'rand.dag');
        expect(netlist).not.toBeNull();
        const visual = createSimulator(netlist!, 'visual');
        const fast = createSimulator(netlist!, 'fast');
        for (let combo = 0; combo < 2 ** dag.inputs; combo++) {
          for (const sim of [visual, fast]) {
            for (let i = 0; i < dag.inputs; i++) sim.setInput(`i${i}`, (combo >> i) & 1);
            expect(sim.settle().ok).toBe(true);
          }
          for (let o = 0; o < dag.outputs; o++) expect(fast.read(`o${o}`)).toBe(visual.read(`o${o}`));
        }
      }),
      { numRuns: 200 },
    );
  });
});

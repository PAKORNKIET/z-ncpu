// ค่าของขาในชั้นบนสุด ใช้ระบายสีสายบนหน้าจอ editor
import type { ComponentDef } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { ComponentLibrary, compile, createSimulator } from '../src';

const not: ComponentDef = {
  id: 'user.not',
  name: { th: 'NOT', en: 'NOT' },
  kind: 'circuit',
  pins: [
    { name: 'a', dir: 'in', width: 1 },
    { name: 'y', dir: 'out', width: 1 },
  ],
  body: {
    instances: [
      { id: 'nand1', defId: 'prim.nand', x: 0, y: 0, rotation: 0 },
      { id: 'p', defId: 'prim.panel', params: { words: 4, width: 16 }, x: 0, y: 0, rotation: 0 },
    ],
    wires: [
      { id: 'w1', from: { inst: 'self', pin: 'a' }, to: { inst: 'nand1', pin: 'a' } },
      { id: 'w2', from: { inst: 'self', pin: 'a' }, to: { inst: 'nand1', pin: 'b' } },
      { id: 'w3', from: { inst: 'nand1', pin: 'y' }, to: { inst: 'self', pin: 'y' } },
    ],
  },
};

describe('readScope', () => {
  it.each(['visual', 'fast'] as const)('คืนค่าของทุกขาในชั้นบนสุด (%s)', (mode) => {
    const { netlist } = compile(new ComponentLibrary([not]), 'user.not');
    expect([...netlist!.scopePins.keys()].sort()).toEqual(['nand1.a', 'nand1.b', 'nand1.y', 'p.out']);
    const sim = createSimulator(netlist!, mode);
    sim.setInput('a', 1);
    sim.settle();
    expect(sim.readScope()).toEqual({ 'self.a': 1, 'self.y': 0, 'nand1.a': 1, 'nand1.b': 1, 'nand1.y': 0, 'p.out': 0 });
    sim.setInput('a', 0);
    sim.settle();
    expect(sim.readScope()['nand1.y']).toBe(1);
  });

  it('ขาที่ยังไม่มีสัญญาณเป็น X', () => {
    const empty: ComponentDef = { ...not, body: { instances: [not.body!.instances[0]!], wires: [] } };
    const { netlist } = compile(new ComponentLibrary([empty]), 'user.not');
    const sim = createSimulator(netlist!, 'visual');
    sim.settle();
    expect(sim.readScope()['nand1.a']).toBe('X');
    expect(sim.readScope()['self.y']).toBe('X');
  });
});

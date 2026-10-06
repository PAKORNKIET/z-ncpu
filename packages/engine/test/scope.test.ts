// ค่าของขาในชั้นบนสุด ใช้ระบายสีสายบนหน้าจอ editor
import type { ComponentDef } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { ComponentLibrary, compile, createSimulator, scopePins } from '../src';

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
    expect([...scopePins(netlist!, '').keys()].sort()).toEqual(['nand1.a', 'nand1.b', 'nand1.y', 'p.out']);
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

  it('X-Ray: อ่านค่าข้างในชิ้นที่ซ้อนอยู่ได้ทุกชั้น', () => {
    // AND = NAND + NOT, และ NOT = NAND ตัวเดียว
    const and: ComponentDef = {
      id: 'user.and',
      name: { th: 'AND', en: 'AND' },
      kind: 'circuit',
      pins: [
        { name: 'a', dir: 'in', width: 1 },
        { name: 'b', dir: 'in', width: 1 },
        { name: 'y', dir: 'out', width: 1 },
      ],
      body: {
        instances: [
          { id: 'n', defId: 'prim.nand', x: 0, y: 0, rotation: 0 },
          { id: 'inv', defId: 'user.not', x: 0, y: 0, rotation: 0 },
        ],
        wires: [
          { id: 'w1', from: { inst: 'self', pin: 'a' }, to: { inst: 'n', pin: 'a' } },
          { id: 'w2', from: { inst: 'self', pin: 'b' }, to: { inst: 'n', pin: 'b' } },
          { id: 'w3', from: { inst: 'n', pin: 'y' }, to: { inst: 'inv', pin: 'a' } },
          { id: 'w4', from: { inst: 'inv', pin: 'y' }, to: { inst: 'self', pin: 'y' } },
        ],
      },
    };
    const top: ComponentDef = {
      ...and,
      id: 'user.top',
      body: {
        instances: [{ id: 'g', defId: 'user.and', x: 0, y: 0, rotation: 0 }],
        wires: [
          { id: 'w1', from: { inst: 'self', pin: 'a' }, to: { inst: 'g', pin: 'a' } },
          { id: 'w2', from: { inst: 'self', pin: 'b' }, to: { inst: 'g', pin: 'b' } },
          { id: 'w3', from: { inst: 'g', pin: 'y' }, to: { inst: 'self', pin: 'y' } },
        ],
      },
    };
    const { netlist } = compile(new ComponentLibrary([not, and, top]), 'user.top');
    const sim = createSimulator(netlist!, 'visual');
    sim.setInput('a', 1);
    sim.setInput('b', 1);
    sim.settle();
    expect(sim.readScope('g')).toMatchObject({ 'self.a': 1, 'self.b': 1, 'self.y': 1, 'n.y': 0, 'inv.a': 0, 'inv.y': 1 });
    expect(sim.readScope('g/inv')).toMatchObject({ 'self.a': 0, 'self.y': 1, 'nand1.a': 0, 'nand1.b': 0, 'nand1.y': 1 });
    // ชั้นที่ไม่มีได้ object ว่าง, primitive ไม่มีอะไรข้างในนอกจากขาของมันเอง
    expect(sim.readScope('nope')).toEqual({});
    expect(sim.readScope('g/n')).toEqual({ 'self.a': 1, 'self.b': 1, 'self.y': 0 });
  });
});

import type { SequenceSuite, SimMode } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { compile, createSimulator, testComponent, VisualSimulator } from '../src';
import { referenceLibrary } from '../fixtures/reference';

const MODES: SimMode[] = ['visual', 'fast'];

describe.each(MODES)('วงจรที่มี state (%s mode)', (mode) => {
  const lib = referenceLibrary();
  const run = (id: string, suite: SequenceSuite) => {
    const { report, diagnostics } = testComponent(lib, id, suite, mode);
    expect(diagnostics).toEqual([]);
    expect(report?.error).toBeUndefined();
    expect(report?.firstFailure).toBeUndefined();
    expect(report?.passed).toBe(true);
  };

  it('SR Latch: set, จำค่า, reset, จำค่า', () => {
    run('user.srlatch', {
      type: 'sequence',
      steps: [
        { set: { s_n: 1, r_n: 1 }, expect: { q: 'X' } },
        { set: { s_n: 0 }, expect: { q: 1, q_n: 0 } },
        { set: { s_n: 1 }, expect: { q: 1, q_n: 0 } },
        { set: { r_n: 0 }, expect: { q: 0, q_n: 1 } },
        { set: { r_n: 1 }, expect: { q: 0, q_n: 1 } },
      ],
    });
  });

  it('D Latch: e = 1 ส่งผ่าน, e = 0 จำค่า', () => {
    run('user.dlatch', {
      type: 'sequence',
      steps: [
        { set: { d: 1, e: 1 }, expect: { q: 1 } },
        { set: { e: 0 }, expect: { q: 1 } },
        { set: { d: 0 }, expect: { q: 1 } },
        { set: { e: 1 }, expect: { q: 0 } },
      ],
    });
  });

  it('D Flip-Flop: เปลี่ยนค่าเฉพาะตอน tick', () => {
    run('user.dff', {
      type: 'sequence',
      clock: 'clk',
      steps: [
        { set: { d: 1 }, expect: { q: 'X' } },
        { tick: 1, expect: { q: 1 } },
        { set: { d: 0 }, expect: { q: 1 } },
        { tick: 1, expect: { q: 0 } },
        { tick: 3, expect: { q: 0 } },
      ],
    });
  });

  it('Register 1 บิต: load = 0 คงค่าเดิม', () => {
    run('user.bit', {
      type: 'sequence',
      clock: 'clk',
      steps: [
        { set: { in: 1, load: 1 }, tick: 1, expect: { out: 1 } },
        { set: { in: 0, load: 0 }, tick: 1, expect: { out: 1 } },
        { tick: 2, expect: { out: 1 } },
        { set: { load: 1 }, tick: 1, expect: { out: 0 } },
      ],
    });
  });

  it('Counter 4 บิต: reset แล้วนับ 1 ถึง 15 และวนกลับเป็น 0', () => {
    const steps: SequenceSuite['steps'] = [{ set: { reset: 1 }, tick: 1, expect: { q: 0 } }, { set: { reset: 0 } }];
    for (let i = 1; i <= 17; i++) steps.push({ tick: 1, expect: { q: i % 16 } });
    steps.push({ set: { reset: 1 }, tick: 1, expect: { q: 0 } });
    run('user.counter4', { type: 'sequence', clock: 'clk', steps });
  });

  it('จับ oscillation ได้และรายงานเป็น error', () => {
    const { report } = testComponent(
      lib,
      'test.osc',
      { type: 'sequence', steps: [{ set: { en: 0 }, expect: { y: 1 } }, { set: { en: 1 }, expect: { y: 0 } }] },
      mode,
    );
    expect(report?.passed).toBe(false);
    expect(report?.total).toBe(1);
    expect(report?.error?.code).toBe('oscillation');
    expect(report?.error?.message.th).toContain('สลับค่าไปมาไม่หยุด');
  });
});

describe('Visual Mode', () => {
  it('เก็บ trace ของไฟวิ่งทีละ step ได้ และความหน่วงสะสมตามจำนวนชั้นของเกต', () => {
    const { netlist } = compile(referenceLibrary(), 'user.xor');
    const sim = new VisualSimulator(netlist!, { recordTrace: true });
    sim.setInput('a', 0);
    sim.setInput('b', 0);
    sim.settle();
    sim.setInput('a', 1);
    const r = sim.settle();
    expect(r.ok).toBe(true);
    // b = 0 ทำให้ n1 ไม่เปลี่ยน ไฟจึงวิ่งแค่ a → n2 → y = 2 step
    expect(r.steps).toBe(2);
    expect(sim.lastTrace).toHaveLength(2);
    expect(sim.read('y')).toBe(1);
  });

  it('Fast Mode กับ Visual Mode ให้ค่าเดียวกันตลอดการนับของ Counter', () => {
    const { netlist } = compile(referenceLibrary(), 'user.counter4');
    const visual = createSimulator(netlist!, 'visual');
    const fast = createSimulator(netlist!, 'fast');
    for (const sim of [visual, fast]) {
      sim.setInput('reset', 1);
      sim.tick('clk');
      sim.setInput('reset', 0);
    }
    for (let i = 0; i < 40; i++) {
      visual.tick('clk');
      fast.tick('clk');
      expect(fast.read('q')).toBe(visual.read('q'));
      expect([...fast.values]).toEqual([...visual.values]);
    }
  });
});

describe('setup time', () => {
  it.each(MODES)('setInput แล้ว tick ทันที ค่าใหม่ต้องถูกจับใน tick นั้น (%s mode)', (mode) => {
    const { netlist } = compile(referenceLibrary(), 'user.bit');
    const sim = createSimulator(netlist!, mode);
    sim.setInput('load', 1);
    const seen: unknown[] = [];
    for (const v of [1, 0, 1, 1, 0]) {
      sim.setInput('in', v);
      expect(sim.tick('clk').ok).toBe(true);
      seen.push(sim.read('out'));
    }
    expect(seen).toEqual([1, 0, 1, 1, 0]);
    expect(sim.cycle).toBe(5);
  });
});

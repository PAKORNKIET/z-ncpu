import type { PinDef, SignalValue, SimMode } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { exhaustiveRows, inp, testComponent } from '../src';
import { referenceLibrary } from '../fixtures/reference';

type Ref = { inputs: PinDef[]; fn: (i: Record<string, number>) => Record<string, SignalValue> };

const ab = [inp('a'), inp('b')];
const REFERENCE: Record<string, Ref> = {
  'user.not': { inputs: [inp('a')], fn: ({ a }) => ({ y: 1 - (a as number) }) },
  'user.and': { inputs: ab, fn: ({ a, b }) => ({ y: (a as number) & (b as number) }) },
  'user.or': { inputs: ab, fn: ({ a, b }) => ({ y: (a as number) | (b as number) }) },
  'user.xor': { inputs: ab, fn: ({ a, b }) => ({ y: (a as number) ^ (b as number) }) },
  'user.ha': {
    inputs: ab,
    fn: ({ a, b }) => ({ sum: (a as number) ^ (b as number), carry: (a as number) & (b as number) }),
  },
  'user.fa': {
    inputs: [...ab, inp('cin')],
    fn: ({ a, b, cin }) => {
      const s = (a as number) + (b as number) + (cin as number);
      return { sum: s & 1, cout: s >> 1 };
    },
  },
  'user.add4': {
    inputs: [inp('a', 4), inp('b', 4), inp('cin')],
    fn: ({ a, b, cin }) => {
      const s = (a as number) + (b as number) + (cin as number);
      return { sum: s & 15, cout: s >> 4 };
    },
  },
  'user.mux': {
    inputs: [...ab, inp('sel')],
    fn: ({ a, b, sel }) => ({ y: sel ? (b as number) : (a as number) }),
  },
  'user.inc4': { inputs: [inp('a', 4)], fn: ({ a }) => ({ y: ((a as number) + 1) & 15 }) },
};

const MODES: SimMode[] = ['visual', 'fast'];

describe.each(MODES)('วงจร combinational ทดสอบครบทุกกรณี (%s mode)', (mode) => {
  const lib = referenceLibrary();
  it.each(Object.keys(REFERENCE))('%s', (id) => {
    const ref = REFERENCE[id] as Ref;
    const suite = { type: 'truth-table' as const, rows: exhaustiveRows(ref.inputs, ref.fn) };
    const { report, diagnostics } = testComponent(lib, id, suite, mode);
    expect(diagnostics).toEqual([]);
    expect(report?.firstFailure).toBeUndefined();
    expect(report?.passed).toBe(true);
    expect(report?.total).toBe(2 ** ref.inputs.reduce((s, p) => s + p.width, 0));
  });
});

describe('รายงานผลเมื่อผิด', () => {
  it('ชี้แถวแรกที่ผิดพร้อมค่าที่ได้และค่าที่ควรได้', () => {
    const lib = referenceLibrary();
    // ตั้งใจใช้ truth table ของ OR กับวงจร AND
    const rows = exhaustiveRows(ab, ({ a, b }) => ({ y: (a as number) | (b as number) }));
    const { report } = testComponent(lib, 'user.and', { type: 'truth-table', rows }, 'fast');
    expect(report?.passed).toBe(false);
    expect(report?.failed).toBe(2);
    expect(report?.firstFailure).toMatchObject({ inputs: { a: 1, b: 0 }, expected: { y: 1 }, actual: { y: 0 } });
  });

  it('ค่า X ตรวจได้ใน truth table', () => {
    const lib = referenceLibrary();
    const rows = [{ in: { a: 'X' as const, b: 0 }, out: { y: 0 } }, { in: { a: 'X' as const, b: 1 }, out: { y: 'X' as const } }];
    const { report } = testComponent(lib, 'user.and', { type: 'truth-table', rows }, 'visual');
    expect(report?.passed).toBe(true);
  });
});

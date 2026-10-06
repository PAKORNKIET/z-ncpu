import { describe, expect, it } from 'vitest';
import { circuit, compile, ComponentLibrary, inp, nand, out, X } from '../src';
import { EXPECTED_NAND, referenceLibrary } from '../fixtures/reference';

describe('NAND สามค่า', () => {
  it('ขาใดเป็น 0 ได้ 1, ทั้งคู่เป็น 1 ได้ 0, นอกนั้นเป็น X', () => {
    expect(nand(0, 0)).toBe(1);
    expect(nand(0, 1)).toBe(1);
    expect(nand(1, 0)).toBe(1);
    expect(nand(1, 1)).toBe(0);
    expect(nand(0, X)).toBe(1);
    expect(nand(X, 0)).toBe(1);
    expect(nand(1, X)).toBe(X);
    expect(nand(X, X)).toBe(X);
  });
});

describe('flatten', () => {
  const lib = referenceLibrary();

  it.each(Object.entries(EXPECTED_NAND))('%s มี NAND %i ตัว', (id, count) => {
    const { netlist, diagnostics } = compile(lib, id);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(netlist?.gateCount).toBe(count);
  });

  it('split/merge ไม่เพิ่มเกต และ bus ถูกคลี่เป็น net ละบิต', () => {
    const { netlist } = compile(lib, 'user.add4');
    expect(netlist?.inputs.get('a')?.length).toBe(4);
    expect(netlist?.outputs.get('sum')?.length).toBe(4);
  });

  it('ตั้งชื่อ net ตามลำดับชั้นเพื่อใช้กับ Probe', () => {
    const { netlist } = compile(lib, 'user.fa');
    const names = netlist?.netNames.flat() ?? [];
    expect(names).toContain('ha1/xor1.a');
  });

  it('compile primitive ตรงๆ ได้ (ด่านทดลองเล่น NAND)', () => {
    const { netlist } = compile(new ComponentLibrary(), 'prim.nand');
    expect(netlist?.gateCount).toBe(1);
    expect([...(netlist?.inputs.keys() ?? [])]).toEqual(['a', 'b']);
  });
});

describe('diagnostics', () => {
  it('ความกว้างไม่ตรงกันเป็น error', () => {
    const b = circuit('t.width', 'w', [inp('a', 4), out('y')]);
    b.wire('self.a', 'self.y');
    const { netlist, diagnostics } = compile(new ComponentLibrary([b.build()]), 't.width');
    expect(netlist).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain('width-mismatch');
  });

  it('สองเอาต์พุตต่อชนกันเป็น error', () => {
    const b = circuit('t.multi', 'm', [inp('a'), out('y')]);
    const n1 = b.add('prim.nand');
    const n2 = b.add('prim.nand');
    b.wire('self.a', `${n1}.a`).wire('self.a', `${n1}.b`).wire('self.a', `${n2}.a`).wire('self.a', `${n2}.b`);
    b.wire(`${n1}.y`, 'self.y').wire(`${n2}.y`, 'self.y');
    const { netlist, diagnostics } = compile(new ComponentLibrary([b.build()]), 't.multi');
    expect(netlist).toBeNull();
    const d = diagnostics.find((x) => x.code === 'multiple-drivers');
    expect(d?.message.th).toContain('ตัวขับมากกว่าหนึ่ง');
  });

  it('input ลอยเป็นคำเตือน และค่ากลายเป็น X', () => {
    const b = circuit('t.float', 'f', [inp('a'), out('y')]);
    const n = b.add('prim.nand');
    b.wire('self.a', `${n}.a`).wire(`${n}.y`, 'self.y');
    const { netlist, diagnostics } = compile(new ComponentLibrary([b.build()]), 't.float');
    expect(netlist).not.toBeNull();
    const d = diagnostics.find((x) => x.code === 'floating');
    expect(d?.severity).toBe('warning');
    expect(d?.path).toBe('nand1.b');
  });

  it('pin หรือชิ้นที่ไม่มีอยู่เป็น error', () => {
    const b = circuit('t.unknown', 'u', [inp('a'), out('y')]);
    const n = b.add('prim.nand');
    b.wire('self.a', `${n}.c`).wire('ghost.y', 'self.y');
    const { diagnostics } = compile(new ComponentLibrary([b.build()]), 't.unknown');
    expect(diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(['unknown-pin', 'unknown-instance']));
  });

  it('วงจรที่ใช้ตัวเองซ้อนข้างในเป็น error', () => {
    const b = circuit('t.self', 's', [inp('a'), out('y')]);
    const me = b.add('t.self');
    b.wire('self.a', `${me}.a`).wire(`${me}.y`, 'self.y');
    const { netlist, diagnostics } = compile(new ComponentLibrary([b.build()]), 't.self');
    expect(netlist).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain('recursive-def');
  });

  it.each([
    ['width เป็น 0', 'prim.split', { width: 0 }],
    ['width เกิน 4096', 'prim.split', { width: 5000 }],
    ['แบ่งเป็นส่วนเท่ากันไม่ได้', 'prim.merge', { width: 10, parts: 3 }],
    ['แผงกว้างเกิน 4096 บิต', 'prim.panel', { words: 300, width: 16 }],
  ])('params ผิดเป็น error: %s', (_name, defId, params) => {
    const b = circuit('t.param', 'p', [inp('a'), out('y')]);
    b.add(defId, { params });
    b.wire('self.a', 'self.y');
    const { diagnostics } = compile(new ComponentLibrary([b.build()]), 't.param');
    expect(diagnostics.map((d) => d.code)).toContain('bad-param');
  });

  it('เกินจำนวน NAND ที่กำหนดเป็น error', () => {
    const { netlist, diagnostics } = compile(referenceLibrary(), 'user.add4', { maxNand: 10 });
    expect(netlist).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain('gate-limit');
  });
});

describe('ข้อความ error ไม่ท่วม', () => {
  it('แผง 2 ตัวต่อชนกันบนมัดสาย 4096 บิต ขึ้น error ไม่เกิน 21 ข้อ', () => {
    const b = circuit('t.clash', 'c', [out('y', 4096)]);
    const p1 = b.add('prim.panel', { params: { words: 256, width: 16 } });
    const p2 = b.add('prim.panel', { params: { words: 256, width: 16 } });
    b.wire(`${p1}.out`, 'self.y').wire(`${p2}.out`, 'self.y');
    const { netlist, diagnostics } = compile(new ComponentLibrary([b.build()]), 't.clash');
    expect(netlist).toBeNull();
    const clashes = diagnostics.filter((d) => d.code === 'multiple-drivers');
    expect(clashes).toHaveLength(21);
    expect(clashes.at(-1)?.message.th).toContain('อีก 4076 เส้น');
  });
});

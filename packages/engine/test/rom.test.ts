// ROM ที่ผู้เล่นต่อเองจาก MUX + แผงค่าคงที่ (Spec ส่วน 11)
import type { SimMode } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { circuit, compile, ComponentLibrary, contentHash, createSimulator, inp, out, romSampleWords, testComponent } from '../src';
import { referenceLibrary } from '../fixtures/reference';

/** สุ่มแบบกำหนด seed ได้ ผลเทสต์จึงเหมือนเดิมทุกครั้ง */
function words(n: number, seed: number): number[] {
  let x = seed;
  return Array.from({ length: n }, () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x >>> 16;
  });
}

describe('ROM จากแผงค่าคงที่', () => {
  const lib = referenceLibrary();

  it('ROM8 อ่านได้ทุก address ใน Visual Mode', () => {
    const b = circuit('t.rom8', 'r', [inp('addr', 3), out('out', 16)]);
    const p = b.add('prim.panel', { params: { words: 8, width: 16 } });
    const r = b.add('user.rom8');
    b.wire(`${p}.out`, `${r}.data`).wire('self.addr', `${r}.addr`).wire(`${r}.out`, 'self.out');
    const lib8 = new ComponentLibrary([...lib.all(), b.build()]);
    const { netlist, diagnostics } = compile(lib8, 't.rom8');
    expect(diagnostics).toEqual([]);
    const sim = createSimulator(netlist!, 'visual');
    const prog = words(8, 7);
    sim.loadPanel(prog);
    for (let a = 0; a < 8; a++) {
      sim.setInput('addr', a);
      expect(sim.settle().ok).toBe(true);
      expect(sim.read('out')).toBe(prog[a]);
    }
  });

  it.each<SimMode>(['fast', 'visual'])('ROM256 (16,320 NAND) อ่านถูกทั้ง 256 คำ (%s mode)', (mode) => {
    const { netlist, diagnostics } = compile(lib, 'test.progrom');
    expect(diagnostics).toEqual([]);
    expect(netlist?.panels).toHaveLength(1);
    expect(netlist?.panels[0]).toMatchObject({ path: 'panel', words: 256, width: 16 });
    const sim = createSimulator(netlist!, mode);
    const prog = words(256, 42);
    sim.loadPanel(prog, 'panel');
    for (let a = 0; a < 256; a++) {
      sim.setInput('addr', a);
      expect(sim.settle().ok).toBe(true);
      expect(sim.read('out')).toBe(prog[a]);
    }
  });

  it('เปลี่ยนโปรแกรมได้โดยไม่ต้อง compile ใหม่ และคำที่ไม่ได้ใส่เป็น 0', () => {
    const { netlist } = compile(lib, 'test.progrom');
    const sim = createSimulator(netlist!, 'fast');
    // แผงที่ยังไม่ได้ใส่โปรแกรมเป็น 0 ทุกบิต (= NOP ใน Z8)
    sim.setInput('addr', 200);
    sim.settle();
    expect(sim.read('out')).toBe(0);

    sim.loadPanel([0x0900, 0x19f0, 0x4101]);
    for (const [a, w] of [[0, 0x0900], [1, 0x19f0], [2, 0x4101], [3, 0], [255, 0]] as const) {
      sim.setInput('addr', a);
      sim.settle();
      expect(sim.read('out')).toBe(w);
    }
    sim.loadPanel([0xbeef]);
    sim.setInput('addr', 0);
    sim.settle();
    expect(sim.read('out')).toBe(0xbeef);
    sim.setInput('addr', 1);
    sim.settle();
    expect(sim.read('out')).toBe(0);
  });

  it('โปรแกรมไม่อยู่ใน def: hash ของวงจรไม่เปลี่ยนเมื่อแก้โปรแกรม', () => {
    const before = contentHash(lib, 'test.progrom');
    const sim = createSimulator(compile(lib, 'test.progrom').netlist!, 'fast');
    sim.loadPanel(words(256, 1));
    expect(contentHash(lib, 'test.progrom')).toBe(before);
  });

  it('โปรแกรมยาวเกินแผงเป็น error', () => {
    const sim = createSimulator(compile(lib, 'test.progrom').netlist!, 'fast');
    expect(() => sim.loadPanel(new Array(257).fill(0))).toThrow(RangeError);
    expect(() => sim.loadPanel([0x10000])).toThrow(RangeError);
    expect(() => sim.loadPanel([1], 'ไม่มีแผงนี้')).toThrow();
  });

  it('อ่านมัดสายกว้างด้วย readBits', () => {
    const b = circuit('t.wide', 'w', [inp('d', 64), out('q', 64)]);
    b.wire('self.d', 'self.q');
    const sim = createSimulator(compile(new ComponentLibrary([b.build()]), 't.wide').netlist!, 'fast');
    expect(() => sim.read('q')).toThrow(RangeError);
    expect(sim.readBits('q')).toHaveLength(64);
  });
});

describe('ชุดทดสอบแบบ rom (ห่อด้วยแผงค่าคงที่)', () => {
  const lib = referenceLibrary();
  it.each<SimMode>(['fast', 'visual'])('ROM8 และ ROM64 ของจริงผ่าน (%s)', (mode) => {
    expect(testComponent(lib, 'user.rom8', { type: 'rom', words: 8, width: 16 }, mode).report).toMatchObject({ passed: true, total: 16 });
    expect(testComponent(lib, 'user.rom64', { type: 'rom', words: 64, width: 16 }, mode).report?.passed).toBe(true);
  });

  it('ROM ที่สลับ address สองบิต หรือขาไม่ครบ ไม่ผ่าน', () => {
    const b = circuit('user.bad', 'bad', [inp('addr', 3), inp('data', 128), out('out', 16)]);
    const r = b.add('user.rom8');
    const s = b.add('prim.split', { params: { width: 3 } });
    const m = b.add('prim.merge', { params: { width: 3 } });
    b.wire('self.addr', `${s}.in`).wire(`${s}.b0`, `${m}.b1`).wire(`${s}.b1`, `${m}.b0`).wire(`${s}.b2`, `${m}.b2`);
    b.wire(`${m}.out`, `${r}.addr`).wire('self.data', `${r}.data`).wire(`${r}.out`, 'self.out');
    const bad = new ComponentLibrary([...lib.all(), b.build()]);
    expect(testComponent(bad, 'user.bad', { type: 'rom', words: 8, width: 16 }, 'fast').report?.passed).toBe(false);
    const r2 = testComponent(lib, 'user.mux16', { type: 'rom', words: 8, width: 16 }, 'fast');
    expect(r2.report).toBeNull();
    expect(r2.diagnostics[0]?.message.th).toMatch(/ROM ต้องมีขา addr/);
  });

  it('ข้อมูลตัวอย่างไม่ซ้ำกันทุกคำ และ seed เดิมได้ข้อมูลเดิม', () => {
    const w = romSampleWords(256, 16, 3);
    expect(new Set(w).size).toBe(256);
    expect(romSampleWords(256, 16, 3)).toEqual(w);
    expect(romSampleWords(8, 16, 4)).not.toEqual(romSampleWords(8, 16, 3));
  });
});

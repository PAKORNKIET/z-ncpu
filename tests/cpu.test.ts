// โปรแกรมบน CPU (Spec ส่วน 17): CPU ที่ต่อจาก NAND ทั้งเครื่อง รันโปรแกรมแล้วได้ค่าตรงกับ emulator ทุก cycle
import { ComponentLibrary, compile, cpuHarness, createSimulator, resetCpu, ROM_PANEL, testComponent } from '@z-ncpu/engine';
import { LEVELS } from '@z-ncpu/content';
import { assemble, runZ8, Z8_ORACLE } from '@z-ncpu/isa';
import type { ComponentDef, CpuSuite } from '@z-ncpu/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const solution = (id: string): ComponentDef =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'packages', 'content', 'solutions', `${id}.json`), 'utf8')) as ComponentDef;

const level = LEVELS.find((l) => l.id === 'cpu.z8')!;
const suite = level.tests as CpuSuite;
let lib: ComponentLibrary;

beforeAll(() => {
  lib = new ComponentLibrary(LEVELS.map((l) => solution(l.id)));
});

describe('CPU Z8 ที่ต่อจาก NAND', () => {
  it('มี NAND ราว 55,000 ตัวตามที่ Spec ประมาณไว้', () => {
    const gates = compile(lib, 'user.cpu').netlist!.gateCount;
    expect(gates).toBeGreaterThan(50_000);
    expect(gates).toBeLessThan(60_000);
  });

  it('นับ 0 ถึง 9 บนจอ: จอเปลี่ยนตามลำดับแล้วหยุดที่ HALT', () => {
    const harness = cpuHarness(lib, 'user.cpu') as ComponentDef;
    const { netlist } = compile(new ComponentLibrary([...lib.all(), harness]), harness.id);
    const sim = createSimulator(netlist!, 'fast');
    sim.loadPanel(assemble(suite.programs[0]!.source).words, ROM_PANEL);
    expect(resetCpu(sim).ok).toBe(true);
    const shown: number[] = [];
    let cycles = 0;
    while (sim.read('halt') !== 1 && cycles < 100) {
      sim.tick('clk');
      cycles++;
      const v = sim.read('out');
      if (typeof v === 'number' && shown.at(-1) !== v) shown.push(v);
    }
    expect(shown).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(cycles).toBe(41);
    expect(sim.read('pc')).toBe(5);
  });

  it('CPU ที่ต่อ flag C ผิด: บอกโปรแกรม cycle คำสั่ง และขาที่ผิด', () => {
    const broken = structuredClone(solution('cpu.z8'));
    // ต่อ z ของ ALU เข้าตัวเก็บ flag C แทน c
    const andC = broken.body!.wires.find((w) => w.from.pin === 'c' && w.to.pin === 'a')!;
    andC.from.pin = 'z';
    const blib = new ComponentLibrary([...lib.all().filter((d) => d.id !== 'user.cpu'), broken]);
    const { report } = testComponent(blib, 'user.cpu', suite, 'fast', undefined, Z8_ORACLE);
    expect(report?.passed).toBe(false);
    const f = report!.firstFailure!;
    // โปรแกรมนับ 0–9 ยังผ่าน เพราะ CMP A, 10 ให้ C = Z พอดีทุกรอบ
    expect(f.cpu).toEqual({ program: 1, cycle: 3, pc: 2, instruction: 'ADD A, B' });
    expect(f.expected.flags).toBe(0b010);
    expect(f.actual.flags).toBe(0b000);
    expect(f.expected.a).toBe(f.actual.a);
    expect(report!.results[0]!.ok).toBe(true);
  });

  it('ไม่มีขา prog หรือไม่มี emulator: บอกปัญหาแทนการพัง', () => {
    expect(cpuHarness(lib, 'user.alu8')).toMatchObject({ code: 'unknown-pin' });
    const { report } = testComponent(lib, 'user.cpu', suite, 'fast');
    expect(report?.error?.message.th).toContain('emulator');
  });

  it('โปรแกรมทดสอบทุกตัวจบด้วย HALT ภายในจำนวน cycle ที่กำหนด', () => {
    for (const p of suite.programs) {
      const trace = runZ8(assemble(p.source).words, p.maxCycles, p.inputs);
      expect(trace.at(-1)!.halt, p.name.th).toBe(1);
    }
  });
});

// Why? (Spec ส่วน 8) บน CPU ที่ต่อจาก NAND: ยุบเหตุผลให้เหลือขาของชิ้นในชั้นที่ดูอยู่
import { ComponentLibrary, compile, cpuHarness, createSimulator, explainWhy, resetCpu, ROM_PANEL, type Simulator } from '@z-ncpu/engine';
import { LEVELS } from '@z-ncpu/content';
import { assemble } from '@z-ncpu/isa';
import type { ComponentDef } from '@z-ncpu/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const solution = (id: string): ComponentDef =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'packages', 'content', 'solutions', `${id}.json`), 'utf8')) as ComponentDef;

let sim: Simulator;
beforeAll(() => {
  const lib = new ComponentLibrary(LEVELS.map((l) => solution(l.id)));
  const harness = cpuHarness(lib, 'user.cpu') as ComponentDef;
  const { netlist } = compile(new ComponentLibrary([...lib.all(), harness]), harness.id);
  sim = createSimulator(netlist!, 'fast');
  sim.loadPanel(assemble('MOV A, 5\nSTORE [OUT], A\nADD A, 3\nHALT').words, ROM_PANEL);
  for (const p of ['sw', 'btn', 'key']) sim.setInput(p, 0);
  resetCpu(sim);
  sim.tick('clk');
  sim.tick('clk'); // PC ชี้ ADD A, 3
});

describe('Why? บน CPU', () => {
  it('ผล ALU = 8 เพราะ a = 5, b = 3 และ op = ADD', () => {
    const r = explainWhy(sim, 'dut', 'alu81.y')!;
    expect(r.value).toBe(8);
    expect(r.driver).toEqual({ kind: 'instance', id: 'alu81', pins: expect.arrayContaining(['y']) });
    expect(Object.fromEntries(r.causes.map((c) => [c.key, c.value]))).toEqual({ 'alu81.a': 5, 'alu81.b': 3, 'alu81.op': 0 });
    expect(r.state).toBe(false);
  });

  it('ค่าที่จอมาจาก register ที่จำไว้ตั้งแต่ clock ก่อนหน้า', () => {
    const r = explainWhy(sim, 'dut', 'self.out')!;
    expect(r.value).toBe(5);
    expect(r.driver.kind).toBe('instance');
    expect(r.state).toBe(true);
  });

  it('ขาเข้า src ของ ALU มาจาก MUX ที่เลือกค่าคงที่ในคำสั่ง', () => {
    const r = explainWhy(sim, 'dut', 'alu81.b')!;
    expect(r.driver).toMatchObject({ kind: 'instance', id: 'mux81' });
    expect(r.causes).toEqual(expect.arrayContaining([{ key: 'mux81.sel', value: 1 }, { key: 'mux81.b', value: 3 }]));
  });

  it('ขาเข้าของชั้นนี้: บอกให้ไปดูชั้นแม่ และขาที่ไม่มีบอก null', () => {
    expect(explainWhy(sim, 'dut', 'self.sw')).toMatchObject({ driver: { kind: 'self', pins: ['sw'] } });
    expect(explainWhy(sim, '', 'self.sw')).toMatchObject({ driver: { kind: 'self', pins: ['sw'] } });
    expect(explainWhy(sim, 'dut', 'nope.x')).toBeNull();
    expect(explainWhy(sim, '', 'self.pc')).toMatchObject({ value: 2, driver: { kind: 'instance', id: 'dut' } });
  });
});

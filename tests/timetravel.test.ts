// Time travel (Spec ส่วน 9) บน CPU ที่ต่อจาก NAND: ย้อนไป cycle ใดแล้วได้สถานะเดียวกับตอนรันจริงทุกขา
import { ComponentLibrary, compile, cpuHarness, createSimulator, resetCpu, ROM_PANEL, TimeTravel, type Simulator } from '@z-ncpu/engine';
import { LEVELS } from '@z-ncpu/content';
import { assemble } from '@z-ncpu/isa';
import type { ComponentDef } from '@z-ncpu/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const solution = (id: string): ComponentDef =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'packages', 'content', 'solutions', `${id}.json`), 'utf8')) as ComponentDef;

const PROGRAM = `
        MOV A, 0
loop:   LOAD B, [SW]
        ADD A, B
        STORE [OUT], A
        PUSH A
        POP C
        STORE [LEDS], C
        JMP loop
`;
const PINS = ['pc', 'a', 'b', 'c', 'd', 'sp', 'flags', 'out', 'leds', 'halt'];
let newSim: () => Simulator;

beforeAll(() => {
  const lib = new ComponentLibrary(LEVELS.map((l) => solution(l.id)));
  const harness = cpuHarness(lib, 'user.cpu') as ComponentDef;
  const { netlist } = compile(new ComponentLibrary([...lib.all(), harness]), harness.id);
  newSim = () => {
    const sim = createSimulator(netlist!, 'fast');
    sim.loadPanel(assemble(PROGRAM).words, ROM_PANEL);
    sim.setInput('sw', 0);
    sim.setInput('btn', 0);
    sim.setInput('key', 0);
    resetCpu(sim);
    return sim;
  };
});

const state = (sim: Simulator) => Object.fromEntries(PINS.map((p) => [p, sim.read(p)]));
/** สวิตช์เปลี่ยนค่าระหว่างรัน จึงต้องจำลองซ้ำด้วย input ที่บันทึกไว้ ไม่ใช่ค่าปัจจุบัน */
const switchesAt = (c: number): number => (c * 7) % 13;

describe('Time travel บน CPU', () => {
  it('ย้อนไปทุก cycle ได้สถานะตรงกับตอนรันจริง (keyframe ทุก 16 cycle)', () => {
    const sim = newSim();
    const tt = new TimeTravel(sim, 'clk', { keyframeEvery: 16 });
    const base = sim.cycle;
    const truth = [state(sim)];
    for (let i = 0; i < 100; i++) {
      sim.setInput('sw', switchesAt(i));
      expect(tt.tick().ok).toBe(true);
      truth.push(state(sim));
    }
    expect([tt.first - base, tt.last - base]).toEqual([0, 100]);
    for (const c of [0, 1, 15, 16, 17, 50, 99, 100, 37, 3]) {
      expect(tt.seek(base + c).ok).toBe(true);
      expect(sim.cycle - base).toBe(c);
      expect(state(sim), `cycle ${c}`).toEqual(truth[c]);
    }
    // ค่าขาที่บันทึกไว้สำหรับ Logic Analyzer
    expect(tt.read('a', base + 10, base + 12)).toEqual(truth.slice(10, 13).map((t) => t.a));
    expect(tt.read('sw', base + 5, base + 5)).toEqual([switchesAt(5)]);
    expect(tt.read('a', base + 101, base + 101)).toEqual([null]);
  });

  it('ย้อนแล้วเดินต่อ: ประวัติหลังจากนั้นถูกตัด แล้วบันทึกเส้นเวลาใหม่', () => {
    const sim = newSim();
    const tt = new TimeTravel(sim, 'clk', { keyframeEvery: 8 });
    const base = sim.cycle;
    sim.setInput('sw', 1);
    for (let i = 0; i < 40; i++) tt.tick();
    tt.seek(base + 20);
    expect(tt.inPast).toBe(true);
    sim.setInput('sw', 5);
    tt.tick();
    expect(tt.last - base).toBe(21);
    expect(tt.inPast).toBe(false);
    for (let i = 0; i < 10; i++) tt.tick();
    const now = state(sim);
    tt.seek(base + 25);
    tt.seek(base + 31);
    expect(state(sim)).toEqual(now);
  });

  it('เกินงบหน่วยความจำ: ทิ้งช่วงเก่าแต่ยังย้อนในช่วงที่เหลือได้', () => {
    const sim = newSim();
    const probe = new TimeTravel(sim, 'clk', { keyframeEvery: 4 });
    const perFrame = sim.values.length;
    const tt = new TimeTravel(sim, 'clk', { keyframeEvery: 4, budgetBytes: perFrame * 5 + 4096 * 32 * 8 });
    expect(probe.first).toBe(tt.first);
    const base = sim.cycle;
    for (let i = 0; i < 60; i++) tt.tick();
    expect(tt.first - base).toBeGreaterThan(0);
    expect(tt.bytes).toBeLessThanOrEqual(tt.budget);
    const want = state(sim);
    tt.seek(0);
    expect(sim.cycle).toBe(tt.first);
    tt.seek(tt.last);
    expect(state(sim)).toEqual(want);
  });
});

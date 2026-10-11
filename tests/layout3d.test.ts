// มุมมอง 3D (M4-3): ผังของ CPU ทั้งเครื่องจาก path ของเกต
import { buildLayout3D, prefixCounts, GATE_SIZE, type Layout3D } from '@z-ncpu/canvas';
import { LEVELS } from '@z-ncpu/content';
import { ComponentLibrary, compile, cpuHarness, ROM_DUT } from '@z-ncpu/engine';
import type { ComponentDef } from '@z-ncpu/shared';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const solution = (id: string): ComponentDef =>
  JSON.parse(readFileSync(join(import.meta.dirname, '..', 'packages', 'content', 'solutions', `${id}.json`), 'utf8')) as ComponentDef;

/**
 * ทุกชิ้นอยู่ในแท่นของแม่ ชิ้นพี่น้องไม่ทับกัน และ NAND อยู่ในแท่นของชิ้นที่มันอยู่
 * รวบรวมจุดที่ผิดแล้วตรวจครั้งเดียว (CPU มี NAND 55,000 ตัว เรียก expect ทีละค่าช้าเกินไปบนเครื่อง CI)
 */
function checkGeometry(l: Layout3D): void {
  const eps = 1e-6;
  const bad: string[] = [];
  const fail = (what: string): void => {
    if (bad.length < 10) bad.push(what);
  };
  for (const n of l.nodes) {
    if (n.parent !== -1) {
      const p = l.nodes[n.parent]!;
      const inside =
        n.x >= p.x - eps && n.z >= p.z - eps && n.x + n.w <= p.x + p.w + eps && n.z + n.d <= p.z + p.d + eps && n.y > p.y && n.start >= p.start && n.end <= p.end;
      if (!inside) fail(`ชิ้น ${n.path} ไม่อยู่ในแท่นของแม่`);
    }
    const kids = n.children.map((c) => l.nodes[c]!);
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i]!;
        const b = kids[j]!;
        const apart = a.x + a.w <= b.x + eps || b.x + b.w <= a.x + eps || a.z + a.d <= b.z + eps || b.z + b.d <= a.z + eps;
        if (!apart) fail(`ชิ้น ${a.path} ทับ ${b.path}`);
      }
    }
  }
  const half = GATE_SIZE / 2;
  for (let k = 0; k < l.gates.length; k++) {
    const n = l.nodes[l.owner[k]!]!;
    const x = l.pos[k * 3]!;
    const z = l.pos[k * 3 + 2]!;
    const ok = x - half >= n.x && x + half <= n.x + n.w && z - half >= n.z && z + half <= n.z + n.d && k >= n.start && k < n.end;
    if (!ok) fail(`NAND slot ${k} ไม่อยู่บนแท่นของ ${n.path}`);
  }
  expect(bad).toEqual([]);
}

describe('ผัง 3D', () => {
  it('วงจรเล็ก: ชั้นซ้อนถูก slot ของแต่ละชิ้นติดกัน และไม่มีอะไรทับกัน', () => {
    const paths = ['x1/n1', 'x1/n2', 'n9', 'fa/x1/n1', 'fa/x2/n1', 'fa/n5', 'x1/n3', 'other/n1'];
    const l = buildLayout3D(paths);
    expect(l.gates.length).toBe(paths.length);
    expect([...l.gates].sort()).toEqual(paths.map((_, i) => i).sort());
    const x1 = l.nodes.find((n) => n.path === 'x1')!;
    expect(x1.end - x1.start).toBe(3);
    const fa = l.nodes.find((n) => n.path === 'fa')!;
    expect(fa.end - fa.start).toBe(3);
    expect(l.nodes.find((n) => n.path === 'fa/x2')!.depth).toBe(2);
    expect(l.maxDepth).toBe(2);
    checkGeometry(l);
  });

  it('root: แสดงเฉพาะชิ้นข้างใน root', () => {
    const l = buildLayout3D(['panel/n1', 'dut/a/n1', 'dut/n2'], 'dut');
    expect([...l.gates].sort()).toEqual([1, 2]);
    expect(l.nodes.map((n) => n.path).sort()).toEqual(['', 'a']);
  });

  it('prefixCounts นับจำนวนในช่วงได้', () => {
    const p = prefixCounts([1, 0, 1, 1, 0]);
    expect(p[5]! - p[0]!).toBe(3);
    expect(p[4]! - p[2]!).toBe(2);
  });

  // compile CPU ทั้งเครื่องก่อนจัดผัง เครื่อง CI ช้ากว่าเครื่องทั่วไป จึงให้เวลา 30 วินาที (เวลาจัดผังเองยังตรวจแยกด้านล่าง)
  it('CPU Z8 ทั้งเครื่อง (~55,000 NAND) จัดผังได้เร็วและไม่มีอะไรทับกัน', { timeout: 30_000 }, () => {
    const lib = new ComponentLibrary(LEVELS.map((lv) => solution(lv.id)));
    const harness = cpuHarness(lib, 'user.cpu') as ComponentDef;
    const { netlist } = compile(new ComponentLibrary([...lib.all(), harness]), harness.id);
    const t0 = performance.now();
    const l = buildLayout3D(netlist!.gatePath, ROM_DUT);
    const ms = performance.now() - t0;
    expect(l.gates.length).toBe(netlist!.gatePath.filter((p) => p.startsWith(`${ROM_DUT}/`)).length);
    expect(l.gates.length).toBeGreaterThan(50_000);
    expect(l.nodes[0]!.end).toBe(l.gates.length);
    expect(l.maxDepth).toBeGreaterThanOrEqual(3);
    // ภาพรวมไม่แบนหรือยาวเกินไป
    expect(l.width / l.depthSize).toBeGreaterThan(0.5);
    expect(l.width / l.depthSize).toBeLessThan(2);
    expect(ms).toBeLessThan(4000);
    checkGeometry(l);
  });
});

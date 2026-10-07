// Why? (Spec ส่วน 8): ค่าบนขานี้มาจากไหน
// ไล่ย้อนจาก net ไปหาเกตที่ขับ: NAND ให้ 1 เพราะขาที่เป็น 0, ให้ 0 เพราะทั้งสองขาเป็น 1
// แล้วยุบผลให้เหลือระดับชั้นที่ผู้เล่นกำลังดู จึงเห็นเป็นขาของชิ้นส่วน ไม่ใช่ NAND ทีละตัว
// ถ้าไล่แล้ววนกลับมาที่เดิม (latch/flip-flop) แปลว่าค่ามาจากสิ่งที่วงจรจำไว้ตั้งแต่ clock ก่อนหน้า

import type { SignalValue } from '@z-ncpu/shared';
import { X } from './logic';
import type { Simulator } from './sim/base';

export interface WhyCause {
  /** ขาในชั้นที่ดูอยู่ เช่น "alu1.op" */
  key: string;
  value: SignalValue;
}

export type WhyDriver =
  /** ขับโดยชิ้นส่วนในชั้นนี้ */
  | { kind: 'instance'; id: string; pins: string[] }
  /** มาจากขาเข้าของชั้นนี้ (ไล่ต่อได้ในชั้นแม่) */
  | { kind: 'self'; pins: string[] }
  | { kind: 'const' }
  | { kind: 'panel' }
  /** ไม่มีอะไรขับ (ขาลอย ค่าเป็น X) */
  | { kind: 'none' };

export interface WhyResult {
  key: string;
  value: SignalValue;
  driver: WhyDriver;
  /** ขาเข้าของตัวขับที่ทำให้ได้ค่านี้ */
  causes: WhyCause[];
  /** ค่ามาจากสิ่งที่ตัวขับจำไว้ (เปลี่ยนตอนขอบนาฬิกาครั้งก่อน) */
  state: boolean;
}

/** จำนวน net สูงสุดที่ไล่ต่อครั้ง (กันวงจรใหญ่มากค้าง) */
const MAX_VISIT = 200_000;

/**
 * ถามว่าค่าที่ขา key (เช่น "alu1.y" หรือ "self.out") ในชั้น scope มาจากไหน
 * คืน null ถ้าไม่มีขานี้
 */
export function explainWhy(sim: Simulator, scope: string, key: string): WhyResult | null {
  const { netlist } = sim;
  const nets = sim.pinNets(scope, key);
  if (!nets) return null;
  const value = sim.readNets(nets);
  const prefix = scope === '' ? '' : `${scope}/`;
  const { driverGate, gatePath, gateA, gateB, constNets, panels } = netlist;
  const consts = new Set(constNets);
  const panelNets = new Set<number>();
  for (const p of panels) for (const n of p.nets) panelNets.add(n);

  /** ชิ้นในชั้นนี้ที่มีเกต g อยู่ข้างใน ('' = อยู่นอกชั้นนี้) */
  const ownerOf = (g: number): string => {
    const path = gatePath[g] ?? '';
    if (prefix && !path.startsWith(prefix)) return '';
    return path.slice(prefix.length).split('/')[0] ?? '';
  };

  // หาตัวขับของแต่ละบิต
  const owners = new Set<string>();
  let kind: 'instance' | 'self' | 'const' | 'panel' | 'none' = 'none';
  for (const n of nets) {
    const g = driverGate[n] as number;
    if (g >= 0) {
      const o = ownerOf(g);
      if (o) {
        owners.add(o);
        kind = 'instance';
      } else if (kind === 'none') kind = 'self';
    } else if (consts.has(n)) {
      if (kind === 'none') kind = 'const';
    } else if (panelNets.has(n)) {
      if (kind === 'none') kind = 'panel';
    } else if (isTopInput(sim, n) && kind === 'none') kind = 'self';
  }

  const here = netlist.scopes.get(scope) ?? [];

  const selfPins = (): string[] => {
    const found = new Set<string>();
    for (const n of nets) {
      for (const [name, ns] of [...netlist.inputs, ...netlist.outputs]) {
        if (scope === '' && ns.includes(n)) found.add(name);
      }
      if (scope !== '') {
        const cut = scope.lastIndexOf('/');
        const me = netlist.scopes.get(cut === -1 ? '' : scope.slice(0, cut))?.find((i) => i.id === scope.slice(cut + 1));
        for (const [pin, nodes] of me?.pins ?? []) if (nodes.some((node) => netlist.nodeNet[node] === n)) found.add(pin);
      }
    }
    return [...found];
  };

  if (kind !== 'instance' || owners.size !== 1) {
    const driver: WhyDriver =
      kind === 'instance'
        ? { kind: 'instance', id: [...owners].join(', '), pins: [] }
        : kind === 'self'
          ? { kind: 'self', pins: selfPins() }
          : { kind };
    return { key, value, driver, causes: [], state: false };
  }

  // ไล่ย้อนข้างในตัวขับ จนถึงขาเข้าของมัน
  const owner = [...owners][0]!;
  const ownerPrefix = `${prefix}${owner}/`;
  const ownerInst = here.find((i) => i.id === owner);
  const boundary = new Map<number, string>();
  const outPins = new Set<string>();
  for (const [pin, nodes] of ownerInst?.pins ?? []) {
    for (const node of nodes) {
      const n = netlist.nodeNet[node] as number;
      const g = driverGate[n] as number;
      // ขาที่ขับจากข้างในคือขาออก ที่เหลือคือขาเข้า
      if (g >= 0 && (gatePath[g] === `${prefix}${owner}` || (gatePath[g] ?? '').startsWith(ownerPrefix))) outPins.add(pin);
      else boundary.set(n, pin);
    }
  }
  const causeNets = new Set<number>();
  let state = false;
  const onStack = new Set<number>();
  const done = new Set<number>();
  let visits = 0;
  const values = sim.values;
  // DFS แบบ iterative: กันวงจรลึก (เช่น ROM 8 ชั้น) ล้น stack
  const stack: { n: number; expanded: boolean }[] = [...nets].map((n) => ({ n, expanded: false }));
  while (stack.length > 0 && visits < MAX_VISIT) {
    const top = stack[stack.length - 1]!;
    if (top.expanded) {
      stack.pop();
      onStack.delete(top.n);
      done.add(top.n);
      continue;
    }
    top.expanded = true;
    const n = top.n;
    if (done.has(n)) continue;
    if (boundary.has(n) && !nets.includes(n)) {
      causeNets.add(n);
      continue;
    }
    const g = driverGate[n] as number;
    const inside = g >= 0 && (gatePath[g] === `${prefix}${owner}` || (gatePath[g] ?? '').startsWith(ownerPrefix));
    if (!inside) {
      if (boundary.has(n)) causeNets.add(n);
      continue;
    }
    visits++;
    onStack.add(n);
    const a = gateA[g] as number;
    const b = gateB[g] as number;
    const va = values[a];
    const vb = values[b];
    const vy = values[n];
    // NAND = 1 เพราะขาที่เป็น 0 (ถ้าเป็น 0 ทั้งคู่ ไล่ขาแรกพอ), = 0 เพราะทั้งสองขาเป็น 1, X ไล่ขาที่เป็น X
    const next = vy === 1 ? (va === 0 ? [a] : vb === 0 ? [b] : [a, b]) : vy === 0 ? [a, b] : [a, b].filter((m) => values[m] === X);
    for (const m of next) {
      if (onStack.has(m)) {
        state = true;
        continue;
      }
      if (!done.has(m)) stack.push({ n: m, expanded: false });
    }
  }

  // รวมบิตที่เป็นเหตุเป็นขา แล้วอ่านค่าทั้งขา
  const causePins = new Set<string>();
  for (const n of causeNets) causePins.add(boundary.get(n)!);
  const causes: WhyCause[] = [...causePins].sort().map((pin) => {
    const k = `${owner}.${pin}`;
    const ns = sim.pinNets(scope, k);
    return { key: k, value: ns ? sim.readNets(ns) : 'X' };
  });
  return { key, value, driver: { kind: 'instance', id: owner, pins: [...outPins] }, causes, state };
}

function isTopInput(sim: Simulator, net: number): boolean {
  for (const ns of sim.netlist.inputs.values()) if (ns.includes(net)) return true;
  return false;
}

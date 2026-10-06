import type { ComponentDef } from '@z-ncpu/shared';
import type { ComponentLibrary } from './library';
import { PRIMITIVES, PRIMITIVES_VERSION } from './primitives';

/** cyrb53: hash 53 บิตที่เร็วและไม่ต้องพึ่ง crypto ใช้ได้ทั้ง browser, worker และ node */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const hex = (n: number): string => n.toString(16).padStart(14, '0');

/**
 * Content hash ของ def แบบ Merkle (Spec ส่วน 5 ข้อ 16)
 * คำนวณจาก pin + body + hash ของทุก def ที่ใช้ ไม่นับตำแหน่ง การหมุน ป้ายชื่อ และจุดหักของสาย
 * ดังนั้นการจัดวางใหม่ไม่ทำให้ต้องทดสอบใหม่ แต่แก้ XOR แล้ว Adder, ALU, CPU จะได้ hash ใหม่
 */
export function contentHash(lib: ComponentLibrary, defId: string, memo = new Map<string, string>()): string {
  return hashInner(lib, defId, memo, new Set());
}

function hashInner(lib: ComponentLibrary, defId: string, memo: Map<string, string>, visiting: Set<string>): string {
  const cached = memo.get(defId);
  if (cached) return cached;
  if (PRIMITIVES.has(defId)) return `prim${PRIMITIVES_VERSION}`;
  const def = lib.get(defId);
  if (!def) return 'missing';
  if (visiting.has(defId)) throw new Error(`วงจร "${defId}" ใช้ตัวเองซ้อนอยู่ข้างใน`);
  visiting.add(defId);
  const deps = [...new Set(def.body?.instances.map((i) => i.defId) ?? [])].sort();
  const depPart = deps.map((id) => `${id}#${hashInner(lib, id, memo, visiting)}`).join(';');
  visiting.delete(defId);
  const h = hex(cyrb53(canonical(def) + '|' + depPart));
  memo.set(defId, h);
  return h;
}

function canonical(def: ComponentDef): string {
  const pins = def.pins.map((p) => `${p.name}:${p.dir}:${p.width}`).join(',');
  const body = def.body ?? { instances: [], wires: [] };
  const insts = [...body.instances]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((i) => {
      const params = i.params
        ? Object.keys(i.params)
            .sort()
            .map((k) => `${k}=${i.params?.[k]}`)
            .join('&')
        : '';
      return `${i.id}=${i.defId}(${params})`;
    })
    .join(';');
  const wires = body.wires
    .map((w) => {
      const a = `${w.from.inst}.${w.from.pin}`;
      const b = `${w.to.inst}.${w.to.pin}`;
      return a < b ? `${a}-${b}` : `${b}-${a}`;
    })
    .sort()
    .join(';');
  return `v${PRIMITIVES_VERSION}|${def.kind}|${pins}|${insts}|${wires}`;
}

/** def ทุกตัวที่ใช้ defId อยู่ทั้งทางตรงและทางอ้อม ใช้ติดธง "ต้องทดสอบใหม่" */
export function findDependents(lib: ComponentLibrary, defId: string): string[] {
  const users = new Map<string, Set<string>>();
  for (const def of lib.all()) {
    for (const inst of def.body?.instances ?? []) {
      let set = users.get(inst.defId);
      if (!set) users.set(inst.defId, (set = new Set()));
      set.add(def.id);
    }
  }
  const result = new Set<string>();
  const queue = [defId];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    for (const user of users.get(id) ?? []) {
      if (!result.has(user)) {
        result.add(user);
        queue.push(user);
      }
    }
  }
  result.delete(defId);
  return [...result].sort();
}

// ไฟล์บันทึกของผู้เล่น (Spec ส่วน 15): เก็บในเครื่อง (localStorage) และส่งออก/เปิดเป็นไฟล์ .zncpu ได้
// ไฟล์ที่เปิดมาจากข้างนอกเป็นข้อมูลที่เชื่อไม่ได้ จึงตรวจทุกช่องและสร้าง object ใหม่จากช่องที่รู้จักเท่านั้น
// (ไม่มีโค้ดใน DOM ที่นี่ ทดสอบได้ใน Node)

import type { ComponentDef, Instance, LevelProgress, PinDef, Rotation, Wire, ZncpuFile } from '@z-ncpu/shared';

export const SAVE_KEY = 'zncpu.save.v1';
export const BACKUP_KEY = 'zncpu.save.backup';
export const APP_NAME = 'Z-NCPU 0.1';

/** ขีดจำกัดกันไฟล์ที่ใหญ่ผิดปกติ */
export const LIMITS = {
  bytes: 5_000_000,
  components: 500,
  pins: 64,
  instances: 5000,
  wires: 20000,
  points: 100,
} as const;

export type SaveFile = ZncpuFile;

export function emptySave(now = new Date().toISOString()): SaveFile {
  return {
    format: 'zncpu',
    schemaVersion: 1,
    app: APP_NAME,
    project: { id: 'local', name: 'โปรเจกต์ของฉัน', createdAt: now, updatedAt: now },
    components: [],
    programs: [],
    progress: {},
    settings: {},
  };
}

export type ParseResult = { ok: true; save: SaveFile } | { ok: false; reason: string };

class Invalid extends Error {}
const bad = (why: string): never => {
  throw new Invalid(why);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, what: string, max = 200): string =>
  typeof v === 'string' && v.length <= max ? v : bad(`${what} ต้องเป็นข้อความไม่เกิน ${max} ตัวอักษร`);
const name = (v: unknown, what: string, re: RegExp): string => {
  const s = str(v, what, 64);
  return re.test(s) ? s : bad(`${what} "${s}" มีตัวอักษรที่ใช้ไม่ได้`);
};
const int = (v: unknown, what: string, min: number, max: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : bad(`${what} ต้องเป็นจำนวนเต็ม ${min}..${max}`);
const num = (v: unknown, what: string): number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7 ? v : bad(`${what} ต้องเป็นตัวเลข`);
const arr = (v: unknown, what: string, max: number): unknown[] =>
  Array.isArray(v) ? (v.length <= max ? v : bad(`${what} มีมากเกิน ${max} รายการ`)) : bad(`${what} ต้องเป็นรายการ`);

const USER_ID = /^user\.[A-Za-z0-9_]{1,40}$/;
const DEF_ID = /^(prim|user)\.[A-Za-z0-9_]{1,40}$/;
const PIN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;
const INST_ID = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const LEVEL_ID = /^[a-z0-9-]{1,30}\.[a-z0-9-]{1,30}$/;

function pin(v: unknown, i: number): PinDef {
  if (!isObj(v)) return bad(`pin ที่ ${i} ไม่ถูกต้อง`);
  const dir = v.dir === 'in' || v.dir === 'out' ? v.dir : bad('ทิศของ pin ต้องเป็น in หรือ out');
  return { name: name(v.name, 'ชื่อ pin', PIN_NAME), dir, width: int(v.width, 'ความกว้าง pin', 1, 4096) };
}

function instance(v: unknown): Instance {
  if (!isObj(v)) return bad('ชิ้นส่วนไม่ถูกต้อง');
  const rotation = ([0, 90, 180, 270] as const).find((r) => r === v.rotation) ?? bad('การหมุนต้องเป็น 0, 90, 180 หรือ 270');
  const inst: Instance = {
    id: name(v.id, 'ชื่อชิ้นส่วน', INST_ID),
    defId: name(v.defId, 'ชนิดชิ้นส่วน', DEF_ID),
    x: num(v.x, 'ตำแหน่ง x'),
    y: num(v.y, 'ตำแหน่ง y'),
    rotation: rotation as Rotation,
  };
  if (inst.id === 'self') bad('ชื่อชิ้นส่วน "self" ใช้ไม่ได้');
  if (v.params !== undefined) {
    if (!isObj(v.params)) bad('params ไม่ถูกต้อง');
    const params: Record<string, number> = {};
    for (const [k, p] of Object.entries(v.params as Record<string, unknown>).slice(0, 8)) {
      params[name(k, 'ชื่อ param', PIN_NAME)] = int(p, `param ${k}`, 0, 4096);
    }
    inst.params = params;
  }
  if (v.label !== undefined) inst.label = str(v.label, 'ป้ายชื่อ', 60);
  return inst;
}

function ref(v: unknown): { inst: string; pin: string } {
  if (!isObj(v)) return bad('ปลายสายไม่ถูกต้อง');
  const inst = v.inst === 'self' ? 'self' : name(v.inst, 'ชื่อชิ้นส่วนของสาย', INST_ID);
  return { inst, pin: name(v.pin, 'ชื่อขาของสาย', PIN_NAME) };
}

function wire(v: unknown): Wire {
  if (!isObj(v)) return bad('สายไม่ถูกต้อง');
  const w: Wire = { id: name(v.id, 'ชื่อสาย', INST_ID), from: ref(v.from), to: ref(v.to) };
  if (v.points !== undefined) {
    w.points = arr(v.points, 'จุดหักของสาย', LIMITS.points).map((p) => {
      const xy = arr(p, 'จุด', 2);
      return [num(xy[0], 'x'), num(xy[1], 'y')] as [number, number];
    });
  }
  return w;
}

function component(v: unknown): ComponentDef {
  if (!isObj(v)) return bad('ชิ้นส่วนของผู้เล่นไม่ถูกต้อง');
  if (v.kind !== 'circuit') bad('ชิ้นส่วนของผู้เล่นต้องเป็นวงจร');
  const nm = isObj(v.name) ? v.name : bad('ชื่อชิ้นส่วนไม่ถูกต้อง');
  const body = isObj(v.body) ? v.body : bad('วงจรไม่มีส่วน body');
  return {
    id: name(v.id, 'รหัสชิ้นส่วน', USER_ID),
    name: { th: str(nm.th, 'ชื่อไทย', 100), en: str(nm.en, 'ชื่ออังกฤษ', 100) },
    kind: 'circuit',
    pins: arr(v.pins, 'pin', LIMITS.pins).map(pin),
    body: {
      instances: arr(body.instances, 'ชิ้นส่วนในวงจร', LIMITS.instances).map(instance),
      wires: arr(body.wires, 'สาย', LIMITS.wires).map(wire),
      ...(body.terminals !== undefined ? { terminals: terminals(body.terminals) } : {}),
    },
  };
}

/** ตำแหน่งขาวงจรเองที่ผู้เล่นย้ายไว้ */
function terminals(v: unknown): Record<string, { x: number; y: number }> {
  if (!isObj(v)) return bad('ตำแหน่งขาของวงจรไม่ถูกต้อง');
  // Object.fromEntries สร้าง property ของตัวเองเสมอ (ชื่อ "__proto__" จะไม่ไปแก้ prototype)
  return Object.fromEntries(
    Object.entries(v)
      .slice(0, LIMITS.pins)
      .map(([k, p]) => {
        const at = isObj(p) ? p : bad('ตำแหน่งขาของวงจรไม่ถูกต้อง');
        return [name(k, 'ชื่อขา', PIN_NAME), { x: num(at.x, 'ตำแหน่ง x'), y: num(at.y, 'ตำแหน่ง y') }];
      }),
  );
}

function progressEntry(v: unknown): LevelProgress {
  if (!isObj(v)) return bad('ความคืบหน้าไม่ถูกต้อง');
  const p: LevelProgress = { attempts: int(v.attempts ?? 0, 'จำนวนครั้งที่ทดสอบ', 0, 1e9) };
  if (v.passedHash !== undefined) p.passedHash = name(v.passedHash, 'hash', /^[0-9a-f]{1,32}$/);
  if (v.bestNand !== undefined) p.bestNand = int(v.bestNand, 'จำนวน NAND', 0, 1e7);
  return p;
}

/** อ่านไฟล์บันทึก ตรวจทุกช่อง คืน object ใหม่ที่มีเฉพาะช่องที่รู้จัก */
export function parseSave(text: string): ParseResult {
  if (text.length > LIMITS.bytes) return { ok: false, reason: 'ไฟล์ใหญ่เกิน 5 MB' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'ไฟล์ไม่ใช่ JSON' };
  }
  try {
    if (!isObj(raw) || raw.format !== 'zncpu') return bad('ไม่ใช่ไฟล์ของ Z-NCPU');
    if (raw.schemaVersion !== 1) return bad(`ไฟล์รุ่น ${String(raw.schemaVersion)} เปิดด้วยแอปรุ่นนี้ไม่ได้`);
    const project = isObj(raw.project) ? raw.project : {};
    const now = new Date().toISOString();
    const save = emptySave(now);
    save.project = {
      id: typeof project.id === 'string' ? str(project.id, 'project id', 64) : 'local',
      name: typeof project.name === 'string' ? str(project.name, 'ชื่อโปรเจกต์', 100) : save.project.name,
      createdAt: typeof project.createdAt === 'string' ? str(project.createdAt, 'วันที่', 40) : now,
      updatedAt: typeof project.updatedAt === 'string' ? str(project.updatedAt, 'วันที่', 40) : now,
    };
    const ids = new Set<string>();
    for (const c of arr(raw.components ?? [], 'ชิ้นส่วนของผู้เล่น', LIMITS.components).map(component)) {
      if (ids.has(c.id)) bad(`ชิ้นส่วน ${c.id} ซ้ำ`);
      ids.add(c.id);
      save.components.push(c);
    }
    for (const p of arr(raw.programs ?? [], 'โปรแกรม', 50)) {
      if (!isObj(p)) bad('โปรแกรมไม่ถูกต้อง');
      const prog = p as Record<string, unknown>;
      if (prog.isa !== 'Z8') bad('โปรแกรมต้องเป็นของ ISA Z8');
      save.programs.push({ id: name(prog.id, 'ชื่อโปรแกรม', /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,39}$/), isa: 'Z8', source: str(prog.source, 'ซอร์สของโปรแกรม', 64_000) });
    }
    if (raw.progress !== undefined) {
      if (!isObj(raw.progress)) bad('ความคืบหน้าไม่ถูกต้อง');
      for (const [id, p] of Object.entries(raw.progress as Record<string, unknown>).slice(0, 1000)) {
        save.progress[name(id, 'รหัสด่าน', LEVEL_ID)] = progressEntry(p);
      }
    }
    return { ok: true, save };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, reason: e.message };
    throw e;
  }
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save, null, 1);
}

/** ที่เก็บแบบ localStorage (ส่งเข้ามาเพื่อให้ทดสอบได้ และรองรับกรณีเบราว์เซอร์ปิด storage) */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** โหลดจากที่เก็บ ถ้าข้อมูลเสียจะเริ่มใหม่และเก็บของเดิมไว้ที่ BACKUP_KEY */
export function loadSave(store: KeyValueStore | null): { save: SaveFile; warning?: string } {
  let text: string | null;
  try {
    text = store?.getItem(SAVE_KEY) ?? null;
  } catch {
    return { save: emptySave(), warning: 'เบราว์เซอร์นี้ไม่ให้บันทึกข้อมูล ความคืบหน้าจะหายเมื่อปิดหน้า' };
  }
  if (text === null) return { save: emptySave() };
  const r = parseSave(text);
  if (r.ok) return { save: r.save };
  try {
    store?.setItem(BACKUP_KEY, text);
  } catch {
    // ไม่เป็นไร
  }
  return { save: emptySave(), warning: `ข้อมูลที่บันทึกไว้เสีย (${r.reason}) จึงเริ่มใหม่ ข้อมูลเดิมเก็บสำรองไว้แล้ว` };
}

export function storeSave(store: KeyValueStore | null, save: SaveFile): boolean {
  try {
    store?.setItem(SAVE_KEY, serializeSave(save));
    return store !== null;
  } catch {
    return false;
  }
}

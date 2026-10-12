// ISA ของผู้เล่น (M5-3): เพิ่มคำสั่งของตัวเองในกลุ่ม 11 ของ Z8 ที่ Spec สงวนไว้ให้ (func 0–7)
// ไฟล์นิยาม (.isa.json) เป็นข้อมูลล้วน ไฟล์จากข้างนอกเชื่อไม่ได้ จึงตรวจทุกช่องแล้วสร้าง object ใหม่
// assembler, disassembler, emulator และคำอธิบาย "คำสั่งถัดไป" อ่านคำสั่งใหม่จากที่นี่ทั้งหมด

import type { CpuOracle, CpuSuite, CustomInstruction, IsaExtension, IsaOperandKind, LocalizedText } from '@z-ncpu/shared';
import { assemble, disassembleWord, formatDiagnostic } from './asm';
import { Z8, type IsaDef } from './index';
import { runZ8 } from './machine';
import { parseSemantics, type SemAssign } from './sem';

export const CUSTOM_GROUP = 3;
export const CUSTOM_SLOTS = 8;
export const ISA_FILE_MAX_BYTES = 20_000;

/** รูปแบบตัวถูกดำเนินการที่ encode ได้ (rd อยู่บิต 10–9, src/[src] อยู่บิต 8–0) */
export const OPERAND_FORMS: readonly (readonly IsaOperandKind[])[] = [[], ['rd'], ['src'], ['[src]'], ['rd', 'src'], ['rd', '[src]'], ['[src]', 'rd']];

const MNEMONIC = /^[A-Z][A-Z0-9]{1,7}$/;
const msg = (th: string, en: string): LocalizedText => ({ th, en });

/** ISA เริ่มต้นของ CPU Z8+ (ตรงกับด่านโบนัสของบท 9) */
export const Z8_PLUS_DEFAULT: IsaExtension = {
  format: 'zncpu-isa',
  version: 1,
  base: 'Z8',
  name: 'Z8+',
  instructions: [{ mnemonic: 'SHR', func: 0, operands: ['rd'], semantics: 'rd = rd >> 1', description: 'เลื่อนบิตไปทางขวา 1 ตำแหน่ง (หารสองปัดเศษทิ้ง)' }],
};

export interface IsaIssue {
  /** ลำดับคำสั่งในไฟล์ (−1 = ทั้งไฟล์) */
  index: number;
  field: 'mnemonic' | 'func' | 'operands' | 'semantics' | 'file';
  message: LocalizedText;
}

/** คำสั่งที่ตรวจแล้ว พร้อมสูตรที่แปลงแล้ว */
export interface CompiledCustom extends CustomInstruction {
  assigns: SemAssign[];
}

const sameForm = (a: readonly IsaOperandKind[], b: readonly IsaOperandKind[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** ตรวจ ISA ของผู้เล่น: ชื่อไม่ชนของเดิม func ไม่ซ้ำ รูปแบบตัวถูกดำเนินการถูก และสูตรใช้ได้ */
export function checkExtension(ext: IsaExtension, base: IsaDef = Z8): { issues: IsaIssue[]; compiled: CompiledCustom[] } {
  const issues: IsaIssue[] = [];
  const compiled: CompiledCustom[] = [];
  const taken = new Set([...base.instructions.map((d) => d.mnemonic), ...Object.keys(base.registers), ...base.memoryMap.flatMap((m) => (m.symbol ? [m.symbol.toUpperCase()] : []))]);
  const names = new Map<string, number>();
  const funcs = new Map<number, number>();
  if (ext.instructions.length > CUSTOM_SLOTS) {
    issues.push({ index: -1, field: 'file', message: msg(`เพิ่มได้ไม่เกิน ${CUSTOM_SLOTS} คำสั่ง (กลุ่ม 11 มี func 0–7)`, `at most ${CUSTOM_SLOTS} instructions (group 11 has func 0–7)`) });
  }
  ext.instructions.forEach((ins, index) => {
    let ok = true;
    const bad = (field: IsaIssue['field'], m: LocalizedText): void => {
      issues.push({ index, field, message: m });
      ok = false;
    };
    const mn = ins.mnemonic;
    if (!MNEMONIC.test(mn)) bad('mnemonic', msg('ชื่อคำสั่งเป็นตัวพิมพ์ใหญ่ A–Z และตัวเลข 2–8 ตัว ขึ้นต้นด้วยตัวอักษร เช่น SHR', 'name must be 2–8 capital letters or digits starting with a letter, e.g. SHR'));
    else if (taken.has(mn)) bad('mnemonic', msg(`${mn} มีอยู่แล้วใน Z8 (ชื่อคำสั่ง register หรือชื่อ I/O)`, `${mn} already exists in Z8 (instruction, register or I/O name)`));
    else if (names.has(mn)) bad('mnemonic', msg(`ชื่อ ${mn} ซ้ำกับคำสั่งที่ ${names.get(mn)! + 1}`, `${mn} duplicates instruction ${names.get(mn)! + 1}`));
    else names.set(mn, index);
    if (!Number.isInteger(ins.func) || ins.func < 0 || ins.func >= CUSTOM_SLOTS) bad('func', msg('func ต้องเป็น 0–7', 'func must be 0–7'));
    else if (funcs.has(ins.func)) bad('func', msg(`func ${ins.func} ซ้ำกับคำสั่งที่ ${funcs.get(ins.func)! + 1}`, `func ${ins.func} duplicates instruction ${funcs.get(ins.func)! + 1}`));
    else funcs.set(ins.func, index);
    if (!OPERAND_FORMS.some((f) => sameForm(f, ins.operands))) bad('operands', msg('รูปแบบตัวถูกดำเนินการนี้ใช้ไม่ได้', 'this operand form is not supported'));
    const sem = parseSemantics(ins.semantics);
    if (!sem.ok) {
      bad('semantics', msg(`ตำแหน่ง ${sem.error.col}: ${sem.error.message.th}`, `column ${sem.error.col}: ${sem.error.message.en}`));
    } else {
      if (sem.reads.has('RD') && !ins.operands.includes('rd')) bad('semantics', msg('สูตรใช้ rd แต่คำสั่งไม่มีตัวถูกดำเนินการ rd', 'the formula uses rd but the instruction has no rd operand'));
      if (sem.reads.has('SRC') && !ins.operands.some((o) => o !== 'rd')) bad('semantics', msg('สูตรใช้ src แต่คำสั่งไม่มีตัวถูกดำเนินการ src', 'the formula uses src but the instruction has no src operand'));
      if (ok) compiled.push({ ...ins, assigns: sem.assigns });
    }
  });
  return { issues, compiled };
}

const extCache = new WeakMap<IsaExtension, IsaDef>();

/**
 * ISA ของ Z8 ที่มีคำสั่งของผู้เล่นต่อท้าย (คำสั่งที่ยังมีข้อผิดพลาดไม่ถูกรวม)
 * ผลถูกจำไว้ต่อ object เดียวกัน จะได้ไม่ parse สูตรซ้ำทุกครั้งที่ assemble
 */
export function extendIsa(ext: IsaExtension | undefined, base: IsaDef = Z8): IsaDef {
  if (!ext) return base;
  const hit = extCache.get(ext);
  if (hit) return hit;
  const { compiled } = checkExtension(ext, base);
  const isa: IsaDef = {
    ...base,
    name: ext.name || `${base.name}+`,
    instructions: [
      ...base.instructions,
      ...compiled.map((c) => ({
        mnemonic: c.mnemonic,
        group: CUSTOM_GROUP,
        func: c.func,
        operands: [...c.operands],
        semantics: c.semantics,
        assigns: c.assigns,
        ...(c.description ? { description: c.description } : {}),
      })),
    ],
  };
  extCache.set(ext, isa);
  return isa;
}

/** คำตอบอ้างอิงสำหรับทดสอบ CPU ด้วย ISA นี้ */
export function makeOracle(isa: IsaDef): CpuOracle {
  return {
    assemble(source) {
      const r = assemble(source, isa);
      if (!r.ok) throw new Error(r.diagnostics.map((d) => formatDiagnostic(d)).join('\n'));
      return r.words;
    },
    run: (words, maxCycles, inputs) => runZ8(words, maxCycles, inputs, isa),
    disassemble: (word) => disassembleWord(word, isa),
  };
}

/** oracle ของชุดทดสอบ CPU: ถ้าด่านเพิ่มคำสั่งไว้ emulator ต้องรู้จักคำสั่งนั้นด้วย */
export function isaOfSuite(suite: { type: string; isa?: IsaExtension }): IsaDef {
  return suite.type === 'cpu' && (suite as CpuSuite).isa ? extendIsa((suite as CpuSuite).isa) : Z8;
}

// ---------- ไฟล์ .isa.json ----------

export type IsaFileResult = { ok: true; ext: IsaExtension } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * อ่านโครงสร้างของ ISA จากข้อมูลที่เชื่อไม่ได้ (ไฟล์ที่เปิดเข้ามา หรือช่อง isa ใน save)
 * ตรวจแค่ชนิดและขนาด ส่วนความถูกต้องของคำสั่ง (ชื่อซ้ำ สูตรผิด) ใช้ checkExtension แสดงให้ผู้เล่นแก้
 */
export function readIsaExtension(raw: unknown): IsaFileResult {
  const fail = (reason: string): IsaFileResult => ({ ok: false, reason });
  if (!isObj(raw) || raw.format !== 'zncpu-isa') return fail('ไม่ใช่ไฟล์ ISA ของ Z-NCPU');
  if (raw.version !== 1) return fail(`ไฟล์ ISA รุ่น ${String(raw.version)} เปิดด้วยแอปรุ่นนี้ไม่ได้`);
  if (raw.base !== 'Z8') return fail('ไฟล์ ISA ต้องต่อยอดจาก Z8');
  const name = typeof raw.name === 'string' && raw.name.length <= 40 ? raw.name : 'ISA ของฉัน';
  if (!Array.isArray(raw.instructions)) return fail('ไฟล์ ISA ไม่มีรายการคำสั่ง');
  if (raw.instructions.length > CUSTOM_SLOTS) return fail(`ไฟล์ ISA มีคำสั่งเกิน ${CUSTOM_SLOTS} คำสั่ง`);
  const instructions: CustomInstruction[] = [];
  for (const v of raw.instructions as unknown[]) {
    if (!isObj(v)) return fail('คำสั่งในไฟล์ ISA ไม่ถูกต้อง');
    if (typeof v.mnemonic !== 'string' || v.mnemonic.length > 8) return fail('ชื่อคำสั่งต้องเป็นข้อความไม่เกิน 8 ตัวอักษร');
    if (typeof v.func !== 'number' || !Number.isInteger(v.func) || v.func < 0 || v.func > 7) return fail('func ต้องเป็นจำนวนเต็ม 0–7');
    if (!Array.isArray(v.operands) || v.operands.length > 2) return fail('ตัวถูกดำเนินการไม่ถูกต้อง');
    const operands = (v.operands as unknown[]).map((o) => (o === 'rd' || o === 'src' || o === '[src]' ? o : undefined));
    if (operands.includes(undefined)) return fail('ตัวถูกดำเนินการต้องเป็น rd, src หรือ [src]');
    if (typeof v.semantics !== 'string' || v.semantics.length > 300) return fail('สูตรต้องเป็นข้อความไม่เกิน 300 ตัวอักษร');
    const ins: CustomInstruction = { mnemonic: v.mnemonic, func: v.func, operands: operands as IsaOperandKind[], semantics: v.semantics };
    if (v.description !== undefined) {
      if (typeof v.description !== 'string' || v.description.length > 120) return fail('คำอธิบายต้องเป็นข้อความไม่เกิน 120 ตัวอักษร');
      ins.description = v.description;
    }
    instructions.push(ins);
  }
  return { ok: true, ext: { format: 'zncpu-isa', version: 1, base: 'Z8', name, instructions } };
}

export function parseIsaFile(text: string): IsaFileResult {
  if (text.length > ISA_FILE_MAX_BYTES) return { ok: false, reason: 'ไฟล์ ISA ใหญ่เกิน 20 KB' };
  try {
    return readIsaExtension(JSON.parse(text));
  } catch {
    return { ok: false, reason: 'ไฟล์ไม่ใช่ JSON' };
  }
}

export const serializeIsa = (ext: IsaExtension): string => JSON.stringify(ext, null, 2);

// Assembler และ disassembler ของ Z8 (Spec ส่วน 10)
// อ่านชุดคำสั่งจากไฟล์ ISA ไม่ hard-code: lexer → parser → หา label (2 รอบ) → encoder → diagnostics
// ทั้งหมดเป็นโค้ดธรรมดา ไม่สร้างโค้ดจากข้อความของผู้ใช้ (ไม่มี eval)

import type { LocalizedText } from '@z-ncpu/shared';
import { decode, encode, formatDecoded, Z8, type IsaDef, type Src } from './index';

export interface AsmDiagnostic {
  /** บรรทัด เริ่มที่ 1 */
  line: number;
  /** คอลัมน์ เริ่มที่ 1 */
  col: number;
  length: number;
  severity: 'error' | 'warning';
  message: LocalizedText;
}

export interface AsmResult {
  ok: boolean;
  /** รหัสเครื่อง เรียงตาม address ของ ROM */
  words: number[];
  /** address → บรรทัดในซอร์ส (ใช้ไฮไลต์ตอนดีบัก) */
  lineOf: number[];
  /** ชื่อ label → address (ชื่อตามที่เขียนครั้งแรก) */
  labels: Record<string, number>;
  diagnostics: AsmDiagnostic[];
}

/** ROM ของ Z8 มี 256 คำสั่ง */
export const ROM_WORDS = 256;

type TokKind = 'ident' | 'num' | 'punct';
interface Tok {
  kind: TokKind;
  text: string;
  col: number;
  value?: number;
}

const msg = (th: string, en: string): LocalizedText => ({ th, en });

class AsmError extends Error {
  constructor(
    readonly col: number,
    readonly length: number,
    readonly text: LocalizedText,
  ) {
    super(text.en);
  }
}

// ---------- lexer ----------

const IDENT = /^[\p{L}_.][\p{L}\p{M}\p{N}_.]*/u;
const NUMBER = /^(0x[0-9a-f]+|0b[01]+|[0-9]+)(?![\p{L}\p{N}_])/iu;

/** ตัด comment (; ถึงท้ายบรรทัด) โดยไม่ตัดใน 'x' */
function stripComment(line: string): string {
  let inChar = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'") inChar = !inChar;
    else if (ch === ';' && !inChar) return line.slice(0, i);
  }
  return line;
}

function lex(line: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    const ch = line[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    const col = i + 1;
    if (ch === "'") {
      const m = /^'(\\?.)'/u.exec(rest);
      if (!m) throw new AsmError(col, 1, msg("ตัวอักษรต้องเขียนแบบ 'A'", "character literal must look like 'A'"));
      const body = m[1]!;
      const c = body.length === 2 ? ({ n: 10, t: 9, '0': 0, '\\': 92, "'": 39 } as Record<string, number>)[body[1]!] : body.codePointAt(0);
      if (c === undefined || c > 255) throw new AsmError(col, m[0].length, msg('ใช้ได้เฉพาะตัวอักษร ASCII', 'only ASCII characters are allowed'));
      toks.push({ kind: 'num', text: m[0], col, value: c });
      i += m[0].length;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const m = NUMBER.exec(rest);
      if (!m) {
        const bad = /^[\p{L}\p{N}_]+/u.exec(rest)![0];
        throw new AsmError(col, bad.length, msg(`"${bad}" ไม่ใช่ตัวเลขที่ถูกต้อง (เช่น 10, 0x0A, 0b1010)`, `"${bad}" is not a valid number (e.g. 10, 0x0A, 0b1010)`));
      }
      const t = m[0].toLowerCase();
      const value = t.startsWith('0x') ? parseInt(t.slice(2), 16) : t.startsWith('0b') ? parseInt(t.slice(2), 2) : parseInt(t, 10);
      toks.push({ kind: 'num', text: m[0], col, value });
      i += m[0].length;
      continue;
    }
    const id = IDENT.exec(rest);
    if (id) {
      toks.push({ kind: 'ident', text: id[0], col });
      i += id[0].length;
      continue;
    }
    if (',[]:+-='.includes(ch)) {
      toks.push({ kind: 'punct', text: ch, col });
      i++;
      continue;
    }
    throw new AsmError(col, 1, msg(`ไม่รู้จักอักขระ "${ch}"`, `unexpected character "${ch}"`));
  }
  return toks;
}

// ---------- parser ----------

/** นิพจน์: ผลบวก/ลบของตัวเลข ตัวอักษร และชื่อ (label หรือ .equ) */
interface Term {
  sign: 1 | -1;
  tok: Tok;
}
interface Expr {
  terms: Term[];
  col: number;
  length: number;
}
type Operand = { kind: 'reg'; name: string; col: number; length: number; bracket: boolean } | { kind: 'expr'; expr: Expr; col: number; length: number; bracket: boolean };

interface Stmt {
  line: number;
  label?: Tok;
  /** .equ ชื่อ, ค่า */
  equ?: { name: Tok; expr: Expr };
  /** .word ค่า (ใส่ 16 บิตตรงๆ) */
  word?: Expr;
  ins?: { mnemonic: Tok; operands: Operand[] };
}

const spanEnd = (t: Tok): number => t.col + t.text.length;

class Cursor {
  i = 0;
  constructor(
    readonly toks: Tok[],
    readonly lineLength: number,
  ) {}
  peek(): Tok | undefined {
    return this.toks[this.i];
  }
  next(): Tok | undefined {
    return this.toks[this.i++];
  }
  isPunct(p: string): boolean {
    const t = this.peek();
    return !!t && t.kind === 'punct' && t.text === p;
  }
  endCol(): number {
    return this.lineLength + 1;
  }
}

function parseExpr(c: Cursor): Expr {
  const terms: Term[] = [];
  const start = c.peek();
  let sign: 1 | -1 = 1;
  if (c.isPunct('-') || c.isPunct('+')) sign = c.next()!.text === '-' ? -1 : 1;
  for (;;) {
    const t = c.next();
    if (!t || t.kind === 'punct') {
      const col = t ? t.col : c.endCol();
      throw new AsmError(col, 1, msg('ต้องการตัวเลข ชื่อ label หรือ register ตรงนี้', 'expected a number, label or register here'));
    }
    terms.push({ sign, tok: t });
    if (c.isPunct('+') || c.isPunct('-')) {
      sign = c.next()!.text === '-' ? -1 : 1;
      continue;
    }
    break;
  }
  const last = terms[terms.length - 1]!.tok;
  return { terms, col: start!.col, length: spanEnd(last) - start!.col };
}

function parseOperand(c: Cursor, isReg: (name: string) => boolean): Operand {
  const open = c.isPunct('[') ? c.next()! : undefined;
  const first = c.peek();
  let op: Operand;
  if (first && first.kind === 'ident' && isReg(first.text) && !(c.toks[c.i + 1]?.kind === 'punct' && '+-'.includes(c.toks[c.i + 1]!.text))) {
    c.next();
    op = { kind: 'reg', name: first.text.toUpperCase(), col: first.col, length: first.text.length, bracket: false };
  } else {
    const expr = parseExpr(c);
    op = { kind: 'expr', expr, col: expr.col, length: expr.length, bracket: false };
  }
  if (open) {
    const close = c.next();
    if (!close || close.kind !== 'punct' || close.text !== ']') {
      throw new AsmError(close?.col ?? c.endCol(), 1, msg('ขาด "]" ปิดวงเล็บ', 'missing closing "]"'));
    }
    op.bracket = true;
    op.length = spanEnd(close) - open.col;
    op.col = open.col;
  }
  return op;
}

function parseLine(text: string, line: number, isReg: (name: string) => boolean): Stmt | undefined {
  const body = stripComment(text);
  const toks = lex(body);
  if (toks.length === 0) return undefined;
  const c = new Cursor(toks, body.trimEnd().length);
  const stmt: Stmt = { line };
  // label: ที่ต้นบรรทัด
  if (toks[0]!.kind === 'ident' && toks[1]?.kind === 'punct' && toks[1].text === ':') {
    stmt.label = toks[0]!;
    c.i = 2;
  }
  const head = c.next();
  if (!head) return stmt;
  if (head.kind !== 'ident') {
    throw new AsmError(head.col, head.text.length, msg('บรรทัดต้องขึ้นต้นด้วยชื่อคำสั่ง เช่น MOV หรือ label:', 'a line must start with an instruction such as MOV, or a label:'));
  }
  // ชื่อ = ค่า เป็นอีกแบบของ .equ
  if (c.isPunct('=')) {
    c.next();
    stmt.equ = { name: head, expr: parseExpr(c) };
  } else if (head.text.startsWith('.')) {
    const d = head.text.toLowerCase();
    if (d === '.equ') {
      const name = c.next();
      if (!name || name.kind !== 'ident') throw new AsmError(name?.col ?? c.endCol(), 1, msg('.equ ต้องตามด้วยชื่อ เช่น .equ MAX, 10', '.equ needs a name, e.g. .equ MAX, 10'));
      if (!c.isPunct(',')) throw new AsmError(c.peek()?.col ?? c.endCol(), 1, msg('ขาด "," หลังชื่อ', 'missing "," after the name'));
      c.next();
      stmt.equ = { name, expr: parseExpr(c) };
    } else if (d === '.word') {
      stmt.word = parseExpr(c);
    } else {
      throw new AsmError(head.col, head.text.length, msg(`ไม่รู้จักคำสั่งพิเศษ ${head.text} (มี .equ และ .word)`, `unknown directive ${head.text} (available: .equ, .word)`));
    }
  } else {
    const operands: Operand[] = [];
    if (c.peek()) {
      operands.push(parseOperand(c, isReg));
      while (c.isPunct(',')) {
        c.next();
        operands.push(parseOperand(c, isReg));
      }
    }
    stmt.ins = { mnemonic: head, operands };
  }
  const extra = c.peek();
  if (extra) throw new AsmError(extra.col, extra.text.length, msg(`มีข้อความเกินมา "${extra.text}" (ลืม "," หรือเปล่า?)`, `unexpected "${extra.text}" (missing ","?)`));
  return stmt;
}

// ---------- ตัวช่วย ----------

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length]!;
}

function closest(word: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestD = 3;
  for (const cand of candidates) {
    const dd = distance(word.toUpperCase(), cand.toUpperCase());
    if (dd < bestD) {
      bestD = dd;
      best = cand;
    }
  }
  return best;
}

const operandHelp = (ops: string[]): string => ops.map((o) => (o === '[src]' ? '[src]' : o)).join(', ');

// ---------- assembler ----------

export function assemble(source: string, isa: IsaDef = Z8): AsmResult {
  const diagnostics: AsmDiagnostic[] = [];
  const err = (line: number, col: number, length: number, text: LocalizedText): void => {
    diagnostics.push({ line, col, length: Math.max(1, length), severity: 'error', message: text });
  };
  const regNames = new Set(Object.keys(isa.registers));
  const isReg = (n: string): boolean => regNames.has(n.toUpperCase());
  const mnemonics = isa.instructions.map((d) => d.mnemonic);

  // ชื่อที่รู้จักอยู่แล้ว: address ของ I/O จากไฟล์ ISA
  const symbols = new Map<string, { value: number; name: string; line: number }>();
  for (const m of isa.memoryMap) if (m.symbol) symbols.set(m.symbol.toUpperCase(), { value: m.from, name: m.symbol, line: 0 });
  const builtin = new Set(symbols.keys());

  const stmts: Stmt[] = [];
  source.split('\n').forEach((text, k) => {
    try {
      const s = parseLine(text, k + 1, isReg);
      if (s) stmts.push(s);
    } catch (e) {
      if (e instanceof AsmError) err(k + 1, e.col, e.length, e.text);
      else throw e;
    }
  });

  const define = (tok: Tok, line: number, value: number): void => {
    const key = tok.text.toUpperCase();
    if (isReg(tok.text) || mnemonics.includes(key)) {
      err(line, tok.col, tok.text.length, msg(`ใช้ "${tok.text}" เป็นชื่อไม่ได้ เพราะเป็นชื่อ register หรือคำสั่ง`, `"${tok.text}" is a register or instruction name and cannot be used as a name`));
      return;
    }
    const prev = symbols.get(key);
    if (prev) {
      const where = builtin.has(key) ? msg('ชื่อนี้มีอยู่แล้วในระบบ', 'this name is built in') : msg(`ใช้ไปแล้วที่บรรทัด ${prev.line}`, `already defined on line ${prev.line}`);
      err(line, tok.col, tok.text.length, msg(`ชื่อ "${tok.text}" ซ้ำ (${where.th})`, `duplicate name "${tok.text}" (${where.en})`));
      return;
    }
    symbols.set(key, { value, name: tok.text, line });
  };

  const evalExpr = (e: Expr, line: number): number | undefined => {
    let v = 0;
    for (const { sign, tok } of e.terms) {
      if (tok.kind === 'num') {
        v += sign * tok.value!;
        continue;
      }
      if (isReg(tok.text)) {
        err(line, tok.col, tok.text.length, msg(`ใช้ register ${tok.text.toUpperCase()} ในการบวกลบไม่ได้`, `register ${tok.text.toUpperCase()} cannot be used in arithmetic`));
        return undefined;
      }
      const s = symbols.get(tok.text.toUpperCase());
      if (!s) {
        const near = closest(tok.text, [...symbols.values()].map((x) => x.name));
        const hint = near ? msg(` หมายถึง "${near}" หรือเปล่า?`, ` did you mean "${near}"?`) : msg('', '');
        err(line, tok.col, tok.text.length, msg(`ไม่รู้จักชื่อ "${tok.text}"${hint.th}`, `unknown name "${tok.text}"${hint.en}`));
        return undefined;
      }
      v += sign * s.value;
    }
    return v;
  };

  // รอบที่ 1: นับ address และเก็บชื่อ
  let pc = 0;
  for (const s of stmts) {
    if (s.label) define(s.label, s.line, pc);
    if (s.equ) {
      const v = evalExpr(s.equ.expr, s.line);
      if (v !== undefined) define(s.equ.name, s.line, v);
    }
    if (s.ins || s.word) pc++;
  }

  // รอบที่ 2: encode
  const words: number[] = [];
  const lineOf: number[] = [];
  let tooLong = false;
  for (const s of stmts) {
    if (!s.ins && !s.word) continue;
    if (words.length >= ROM_WORDS) {
      if (!tooLong) err(s.line, 1, 1, msg(`โปรแกรมยาวเกิน ${ROM_WORDS} คำสั่ง (ROM เต็ม)`, `program is longer than ${ROM_WORDS} instructions (ROM is full)`));
      tooLong = true;
      continue;
    }
    const word = s.word ? encodeWord(s.word, s.line) : encodeIns(s.ins!, s.line);
    words.push(word ?? 0);
    lineOf.push(s.line);
  }

  function encodeWord(e: Expr, line: number): number | undefined {
    const v = evalExpr(e, line);
    if (v === undefined) return undefined;
    if (v < 0 || v > 0xffff) {
      err(line, e.col, e.length, msg(`.word รับค่า 0 ถึง 65535 แต่ได้ ${v}`, `.word takes 0 to 65535 but got ${v}`));
      return undefined;
    }
    return v;
  }

  function encodeIns(ins: NonNullable<Stmt['ins']>, line: number): number | undefined {
    const m = ins.mnemonic;
    const def = isa.instructions.find((d) => d.mnemonic === m.text.toUpperCase());
    if (!def) {
      const near = closest(m.text, mnemonics);
      const hint = near ? msg(` หมายถึง ${near} หรือเปล่า?`, ` did you mean ${near}?`) : msg('', '');
      err(line, m.col, m.text.length, msg(`ไม่รู้จักคำสั่ง "${m.text}"${hint.th}`, `unknown instruction "${m.text}"${hint.en}`));
      return undefined;
    }
    if (ins.operands.length !== def.operands.length) {
      const want = def.operands.length === 0 ? msg('ไม่มีตัวถูกดำเนินการ', 'takes no operands') : msg(`ต้องการ ${def.operands.length} ตัว: ${def.mnemonic} ${operandHelp(def.operands)}`, `takes ${def.operands.length}: ${def.mnemonic} ${operandHelp(def.operands)}`);
      err(line, m.col, m.text.length, msg(`${def.mnemonic} ${want.th} แต่เขียนมา ${ins.operands.length} ตัว`, `${def.mnemonic} ${want.en}, got ${ins.operands.length}`));
      return undefined;
    }
    let rd: string | undefined;
    let src: Src | undefined;
    let ok = true;
    def.operands.forEach((kind, k) => {
      const op = ins.operands[k]!;
      if (kind === 'rd') {
        if (op.kind !== 'reg' || op.bracket) {
          err(line, op.col, op.length, msg(`ตรงนี้ต้องเป็น register (${[...regNames].join(', ')})`, `expected a register (${[...regNames].join(', ')}) here`));
          ok = false;
          return;
        }
        rd = op.name;
        return;
      }
      const wantBracket = kind === '[src]';
      if (op.bracket !== wantBracket) {
        err(
          line,
          op.col,
          op.length,
          wantBracket
            ? msg(`${def.mnemonic} อ่าน/เขียนหน่วยความจำ ต้องใส่ address ในวงเล็บ เช่น [0x10]`, `${def.mnemonic} accesses memory; put the address in brackets, e.g. [0x10]`)
            : msg(`${def.mnemonic} ไม่ใช้วงเล็บ [ ] (วงเล็บใช้กับ LOAD และ STORE)`, `${def.mnemonic} does not take brackets (brackets are for LOAD and STORE)`),
        );
        ok = false;
        return;
      }
      if (op.kind === 'reg') {
        src = { reg: op.name };
        return;
      }
      const v = evalExpr(op.expr, line);
      if (v === undefined) {
        ok = false;
        return;
      }
      if (v < -128 || v > 255) {
        err(line, op.col, op.length, msg(`ค่าคงที่ต้องอยู่ระหว่าง -128 ถึง 255 แต่ได้ ${v}`, `constant must be between -128 and 255 but got ${v}`));
        ok = false;
        return;
      }
      src = { imm: v & 0xff };
    });
    if (!ok) return undefined;
    const input = { mnemonic: def.mnemonic, ...(rd !== undefined ? { rd } : {}), ...(src !== undefined ? { src } : {}) };
    return encode(isa, input);
  }

  const labels: Record<string, number> = {};
  for (const [key, s] of symbols) if (!builtin.has(key) && s.line > 0) labels[s.name] = s.value;
  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  const ok = diagnostics.every((d) => d.severity !== 'error');
  return { ok, words, lineOf, labels, diagnostics };
}

/** แปลงรหัสเครื่องกลับเป็นข้อความ คำที่ไม่ใช่คำสั่งมาตรฐานเขียนเป็น .word เพื่อให้ assemble กลับได้ค่าเดิมทุกบิต */
export function disassembleWord(word: number, isa: IsaDef = Z8): string {
  const d = decode(isa, word);
  if (d) {
    try {
      const input = { mnemonic: d.def.mnemonic, ...(d.def.operands.includes('rd') ? { rd: d.rd } : {}), ...(d.def.operands.some((o) => o !== 'rd') ? { src: d.src } : {}) };
      if (encode(isa, input) === word) return formatDecoded(d);
    } catch {
      // ตกไปเขียนเป็น .word
    }
  }
  return `.word 0x${word.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function disassemble(words: readonly number[], isa: IsaDef = Z8): string[] {
  return words.map((w) => disassembleWord(w, isa));
}

/** ข้อความ error แบบอ่านง่าย เช่น "บรรทัด 3 คอลัมน์ 5: ..." */
export function formatDiagnostic(d: AsmDiagnostic, lang: keyof LocalizedText = 'th'): string {
  return lang === 'th' ? `บรรทัด ${d.line} คอลัมน์ ${d.col}: ${d.message.th}` : `line ${d.line}, column ${d.col}: ${d.message.en}`;
}

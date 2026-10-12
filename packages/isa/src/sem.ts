// สูตรของคำสั่งที่ผู้เล่นเพิ่มเอง (M5-3) เช่น "rd = rd >> 1" หรือ "CF = rd & 1; rd = rd >> 1"
// parser ของตัวเองทั้งหมด ไม่สร้างโค้ดจากข้อความ (ไม่มี eval / new Function)
//
// ไวยากรณ์
//   prog    := stmt ((';' | ขึ้นบรรทัดใหม่) stmt)*
//   stmt    := target '=' expr
//   target  := rd | A | B | C | D | Z | CF | N | PC | SP | mem '[' expr ']'
//   expr    := or ('?' expr ':' expr)?
//   or      := and ('||' and)*          and  := bor ('&&' bor)*
//   bor     := bxor ('|' bxor)*         bxor := band ('^' band)*        band := eq ('&' eq)*
//   eq      := rel (('==' | '!=') rel)* rel  := shift (('<' | '<=' | '>' | '>=') shift)*
//   shift   := add (('<<' | '>>') add)* add  := mul (('+' | '-') mul)*  mul  := unary ('*' unary)*
//   unary   := ('~' | '!' | '-') unary | atom
//   atom    := ตัวเลข | ชื่อ | mem '[' expr ']' | '(' expr ')'
//
// ความหมายแบบวงจร single-cycle: ทุกสูตรทางขวาอ่านค่า "ก่อน" คำสั่ง แล้วเขียนทุกที่พร้อมกันตอนขอบนาฬิกา
// register เก็บ 8 บิต (ตัดบิตเกิน), flag เก็บ 1 ถ้าค่าไม่ใช่ 0, ~x กลับบิตแบบ 8 บิต
// PC ที่ไม่ได้เขียนไปคำสั่งถัดไป (PC + 1)

import type { LocalizedText } from '@z-ncpu/shared';

export type SemNode =
  | { k: 'num'; v: number }
  | { k: 'name'; name: SemName }
  | { k: 'mem'; addr: SemNode }
  | { k: 'un'; op: '~' | '!' | '-'; a: SemNode }
  | { k: 'bin'; op: string; a: SemNode; b: SemNode }
  | { k: 'if'; c: SemNode; a: SemNode; b: SemNode };

/** ชื่อที่สูตรอ่านได้ (C คือ register C, ตัวทดใช้ CF แบบเดียวกับ breakpoint) */
export type SemName = 'RD' | 'SRC' | 'A' | 'B' | 'C' | 'D' | 'Z' | 'CF' | 'N' | 'PC' | 'SP';
export type SemTarget = Exclude<SemName, 'SRC'> | 'MEM';

export interface SemAssign {
  target: SemTarget;
  /** address ของ mem[...] */
  addr?: SemNode;
  expr: SemNode;
  /** ข้อความของคำสั่งย่อยนี้ (ใช้อธิบาย) */
  text: string;
}

export interface SemError {
  /** คอลัมน์ในสูตรทั้งก้อน เริ่มที่ 1 */
  col: number;
  message: LocalizedText;
}

export type SemParse = { ok: true; assigns: SemAssign[]; reads: Set<SemName> } | { ok: false; error: SemError };

/** สถานะที่สูตรอ่าน (ค่าก่อนคำสั่ง) */
export interface SemState {
  regs: ArrayLike<number>;
  z: number;
  c: number;
  n: number;
  pc: number;
  sp: number;
  read(addr: number): number;
}

/** สิ่งที่คำสั่งเปลี่ยน (ยังไม่เขียนลงเครื่อง) */
export interface SemEffect {
  regs: [number, number][];
  z?: number;
  c?: number;
  n?: number;
  pc?: number;
  sp?: number;
  mem?: { addr: number; value: number };
}

export const SEM_MAX_LENGTH = 300;

const NAMES: readonly SemName[] = ['RD', 'SRC', 'A', 'B', 'C', 'D', 'Z', 'CF', 'N', 'PC', 'SP'];
const REG_INDEX: Partial<Record<SemName, number>> = { A: 0, B: 1, C: 2, D: 3 };
const msg = (th: string, en: string): LocalizedText => ({ th, en });

class Fail extends Error {
  constructor(
    readonly col: number,
    readonly text: LocalizedText,
  ) {
    super(text.en);
  }
}

type Tok = { t: 'num'; v: number; col: number; end: number } | { t: 'name'; v: string; col: number; end: number } | { t: 'op'; v: string; col: number; end: number };

const OPS = ['<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '<', '>', '+', '-', '*', '&', '|', '^', '~', '!', '(', ')', '[', ']', '?', ':', '=', ';'];

function lex(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    const col = i + 1;
    if (ch === '\n') {
      out.push({ t: 'op', v: ';', col, end: col + 1 });
      i++;
      continue;
    }
    const rest = text.slice(i);
    const num = /^(0x[0-9a-f]+|0b[01]+|[0-9]+)(?![A-Za-z0-9_])/i.exec(rest);
    if (num) {
      const s = num[0].toLowerCase();
      const v = s.startsWith('0x') ? parseInt(s.slice(2), 16) : s.startsWith('0b') ? parseInt(s.slice(2), 2) : parseInt(s, 10);
      if (v > 0xffff) throw new Fail(col, msg(`ตัวเลข ${num[0]} ใหญ่เกินไป`, `number ${num[0]} is too large`));
      out.push({ t: 'num', v, col, end: col + num[0].length });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (id) {
      out.push({ t: 'name', v: id[0], col, end: col + id[0].length });
      i += id[0].length;
      continue;
    }
    const op = OPS.find((o) => rest.startsWith(o));
    if (!op) throw new Fail(col, msg(`ไม่รู้จักอักขระ "${ch}"`, `unexpected character "${ch}"`));
    out.push({ t: 'op', v: op, col, end: col + op.length });
    i += op.length;
  }
  return out;
}

class Parser {
  i = 0;
  reads = new Set<SemName>();
  constructor(
    readonly toks: Tok[],
    readonly endCol: number,
  ) {}
  peek(): Tok | undefined {
    return this.toks[this.i];
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === 'op' && t.v === v;
  }
  expect(v: string, th: string, en: string): Tok {
    const t = this.peek();
    if (!t || t.t !== 'op' || t.v !== v) throw new Fail(t?.col ?? this.endCol, msg(th, en));
    this.i++;
    return t;
  }

  expr(): SemNode {
    const c = this.or();
    if (!this.isOp('?')) return c;
    this.i++;
    const a = this.expr();
    this.expect(':', 'ขาด ":" ของ เงื่อนไข ? ค่าถ้าจริง : ค่าถ้าไม่จริง', 'missing ":" in cond ? a : b');
    const b = this.expr();
    return { k: 'if', c, a, b };
  }
  private level(ops: string[], next: () => SemNode): SemNode {
    let a = next();
    for (;;) {
      const t = this.peek();
      if (!t || t.t !== 'op' || !ops.includes(t.v)) return a;
      this.i++;
      a = { k: 'bin', op: t.v, a, b: next() };
    }
  }
  or = (): SemNode => this.level(['||'], this.and);
  and = (): SemNode => this.level(['&&'], this.bor);
  bor = (): SemNode => this.level(['|'], this.bxor);
  bxor = (): SemNode => this.level(['^'], this.band);
  band = (): SemNode => this.level(['&'], this.eq);
  eq = (): SemNode => this.level(['==', '!='], this.rel);
  rel = (): SemNode => this.level(['<', '<=', '>', '>='], this.shift);
  shift = (): SemNode => this.level(['<<', '>>'], this.add);
  add = (): SemNode => this.level(['+', '-'], this.mul);
  mul = (): SemNode => this.level(['*'], this.unary);
  unary = (): SemNode => {
    const t = this.peek();
    if (t && t.t === 'op' && (t.v === '~' || t.v === '!' || t.v === '-')) {
      this.i++;
      return { k: 'un', op: t.v, a: this.unary() };
    }
    return this.atom();
  };
  atom = (): SemNode => {
    const t = this.peek();
    if (!t) throw new Fail(this.endCol, msg('สูตรจบกลางคัน ต้องการตัวเลขหรือชื่อตรงนี้', 'formula ends early: expected a number or name'));
    if (t.t === 'num') {
      this.i++;
      return { k: 'num', v: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      this.i++;
      const e = this.expr();
      this.expect(')', 'ขาด ")" ปิดวงเล็บ', 'missing ")"');
      return e;
    }
    if (t.t === 'name') {
      this.i++;
      const up = t.v.toUpperCase();
      if (up === 'MEM') {
        this.expect('[', 'mem ต้องตามด้วย [address] เช่น mem[src]', 'mem needs [address], e.g. mem[src]');
        const addr = this.expr();
        this.expect(']', 'ขาด "]" ปิด mem[...]', 'missing "]" after mem[...]');
        return { k: 'mem', addr };
      }
      const name = NAMES.find((n) => n === up);
      if (!name) throw new Fail(t.col, unknownName(t.v));
      this.reads.add(name);
      return { k: 'name', name };
    }
    throw new Fail(t.col, msg(`ไม่คาดว่าจะเจอ "${t.v}" ตรงนี้`, `unexpected "${t.v}" here`));
  };
}

const unknownName = (v: string): LocalizedText =>
  msg(
    `ไม่รู้จัก "${v}" (ใช้ได้: rd, src, A B C D, Z CF N, PC, SP, mem[...])`,
    `unknown name "${v}" (available: rd, src, A B C D, Z CF N, PC, SP, mem[...])`,
  );

/** แปลงสูตรเป็นรายการคำสั่งย่อย ตรวจชื่อ ไวยากรณ์ และที่เขียนซ้ำ */
export function parseSemantics(text: string): SemParse {
  if (text.length > SEM_MAX_LENGTH) return { ok: false, error: { col: SEM_MAX_LENGTH, message: msg(`สูตรยาวเกิน ${SEM_MAX_LENGTH} ตัวอักษร`, `formula is longer than ${SEM_MAX_LENGTH} characters`) } };
  try {
    const toks = lex(text);
    const p = new Parser(toks, text.trimEnd().length + 1);
    const assigns: SemAssign[] = [];
    const seen = new Set<string>();
    let memWrites = 0;
    while (p.peek()) {
      if (p.isOp(';')) {
        p.i++;
        continue;
      }
      const head = p.peek()!;
      if (head.t !== 'name') throw new Fail(head.col, msg('แต่ละส่วนต้องขึ้นต้นด้วยที่ที่จะเขียน เช่น rd = ...', 'each part must start with what to write, e.g. rd = ...'));
      p.i++;
      const up = head.v.toUpperCase();
      let target: SemTarget;
      let addr: SemNode | undefined;
      if (up === 'MEM') {
        p.expect('[', 'mem ต้องตามด้วย [address] เช่น mem[src]', 'mem needs [address], e.g. mem[src]');
        addr = p.expr();
        p.expect(']', 'ขาด "]" ปิด mem[...]', 'missing "]" after mem[...]');
        target = 'MEM';
        if (++memWrites > 1) throw new Fail(head.col, msg('เขียนหน่วยความจำได้ครั้งเดียวต่อคำสั่ง (RAM มีช่องเขียนช่องเดียว)', 'only one memory write per instruction (RAM has one write port)'));
      } else {
        const name = NAMES.find((n) => n === up);
        if (!name) throw new Fail(head.col, unknownName(head.v));
        if (name === 'SRC') throw new Fail(head.col, msg('src เป็นค่าที่อ่านอย่างเดียว เขียนไม่ได้', 'src is read-only'));
        target = name;
        if (seen.has(name)) throw new Fail(head.col, msg(`เขียน ${head.v} ซ้ำสองครั้งในคำสั่งเดียว`, `${head.v} is written twice`));
        seen.add(name);
      }
      p.expect('=', `ขาด "=" หลัง ${head.v}`, `missing "=" after ${head.v}`);
      const expr = p.expr();
      const after = p.peek();
      if (after && !(after.t === 'op' && after.v === ';')) {
        throw new Fail(after.col, msg(`มี "${after.v}" เกินมา (คั่นแต่ละส่วนด้วย ; )`, `unexpected "${after.v}" (separate parts with ;)`));
      }
      const endCol = after ? after.col : text.length + 1;
      assigns.push({ target, ...(addr ? { addr } : {}), expr, text: text.slice(head.col - 1, endCol - 1).trim() });
    }
    if (assigns.length === 0) return { ok: false, error: { col: 1, message: msg('ยังไม่มีสูตร เช่น rd = rd >> 1', 'no formula yet, e.g. rd = rd >> 1') } };
    if (seen.has('RD')) p.reads.add('RD');
    return { ok: true, assigns, reads: p.reads };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: { col: e.col, message: e.text } };
    throw e;
  }
}

function value(n: SemNode, s: SemState, rd: number, src: number): number {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'name':
      switch (n.name) {
        case 'RD':
          return s.regs[rd]!;
        case 'SRC':
          return src;
        case 'Z':
          return s.z;
        case 'CF':
          return s.c;
        case 'N':
          return s.n;
        case 'PC':
          return s.pc;
        case 'SP':
          return s.sp;
        default:
          return s.regs[REG_INDEX[n.name]!]!;
      }
    case 'mem':
      return s.read(value(n.addr, s, rd, src) & 0xff);
    case 'un': {
      const a = value(n.a, s, rd, src);
      return n.op === '~' ? ~a & 0xff : n.op === '!' ? (a === 0 ? 1 : 0) : -a;
    }
    case 'if':
      return value(n.c, s, rd, src) !== 0 ? value(n.a, s, rd, src) : value(n.b, s, rd, src);
    case 'bin': {
      const a = value(n.a, s, rd, src);
      // && || ไม่ประเมินฝั่งขวาถ้าไม่จำเป็น (อ่าน mem ได้โดยไม่มีผลข้างเคียงอยู่แล้ว)
      if (n.op === '&&') return a !== 0 && value(n.b, s, rd, src) !== 0 ? 1 : 0;
      if (n.op === '||') return a !== 0 || value(n.b, s, rd, src) !== 0 ? 1 : 0;
      const b = value(n.b, s, rd, src);
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '&':
          return a & b;
        case '|':
          return a | b;
        case '^':
          return a ^ b;
        case '<<':
          return b >= 0 && b < 24 ? a * 2 ** b : 0;
        case '>>':
          return b >= 0 && b < 31 ? a >> b : a < 0 ? -1 : 0;
        case '==':
          return a === b ? 1 : 0;
        case '!=':
          return a !== b ? 1 : 0;
        case '<':
          return a < b ? 1 : 0;
        case '<=':
          return a <= b ? 1 : 0;
        case '>':
          return a > b ? 1 : 0;
        default:
          return a >= b ? 1 : 0;
      }
    }
  }
}

/** คำนวณผลของคำสั่ง: ทุกสูตรอ่านค่าก่อนคำสั่ง แล้วคืนสิ่งที่จะเขียน */
export function evalSemantics(assigns: readonly SemAssign[], s: SemState, rd: number, src: number): SemEffect {
  const fx: SemEffect = { regs: [] };
  const bit = (v: number): number => (v !== 0 ? 1 : 0);
  for (const a of assigns) {
    const v = value(a.expr, s, rd, src);
    switch (a.target) {
      case 'RD':
        fx.regs.push([rd, v & 0xff]);
        break;
      case 'Z':
        fx.z = bit(v);
        break;
      case 'CF':
        fx.c = bit(v);
        break;
      case 'N':
        fx.n = bit(v);
        break;
      case 'PC':
        fx.pc = v & 0xff;
        break;
      case 'SP':
        fx.sp = v & 0xff;
        break;
      case 'MEM':
        fx.mem = { addr: value(a.addr!, s, rd, src) & 0xff, value: v & 0xff };
        break;
      default:
        fx.regs.push([REG_INDEX[a.target]!, v & 0xff]);
    }
  }
  return fx;
}

// ภาษาเงื่อนไขของ breakpoint (Spec ส่วน 9): parser ของตัวเอง ไม่ใช้ eval
// ตัวอย่าง: PC == 0x14 · A == 10 && Z == 1 · net("dut/alu1.z") == 1 · CYCLE >= 100 || OUT == 9
//
// ไวยากรณ์
//   or      := and ('||' and)*
//   and     := compare ('&&' compare)*
//   compare := sum (('==' | '!=' | '<' | '<=' | '>' | '>=') sum)?
//   sum     := unary (('+' | '-') unary)*
//   unary   := '!' unary | '-' unary | atom
//   atom    := number | name | name '(' "ข้อความ" ')' | name '[' or ']' | '(' or ')'
// ค่าที่ไม่รู้ (X) ทำให้ทั้งนิพจน์เป็น "ไม่จริง" breakpoint จึงไม่หยุดเพราะสัญญาณที่ยังไม่นิ่ง

import type { LocalizedText } from '@z-ncpu/shared';

export type CondNode =
  | { k: 'num'; v: number }
  | { k: 'name'; name: string; col: number }
  | { k: 'call'; name: string; arg: string; col: number }
  | { k: 'index'; name: string; index: CondNode; col: number }
  | { k: 'not' | 'neg'; a: CondNode }
  | { k: 'bin'; op: string; a: CondNode; b: CondNode };

export interface CondError {
  /** คอลัมน์ เริ่มที่ 1 */
  col: number;
  message: LocalizedText;
}

export type CondParse = { ok: true; ast: CondNode } | { ok: false; error: CondError };

/** ตัวอ่านค่า: คืน undefined ถ้าไม่รู้จักชื่อ, 'X' ถ้ายังไม่รู้ค่า */
export interface CondEnv {
  name(name: string): number | 'X' | undefined;
  call?(name: string, arg: string): number | 'X' | undefined;
  index?(name: string, index: number): number | 'X' | undefined;
}

class Fail extends Error {
  constructor(
    readonly col: number,
    readonly text: LocalizedText,
  ) {
    super(text.en);
  }
}

type Tok = { t: 'num'; v: number; col: number } | { t: 'name'; v: string; col: number } | { t: 'str'; v: string; col: number } | { t: 'op'; v: string; col: number };

const OPS = ['==', '!=', '<=', '>=', '&&', '||', '<', '>', '+', '-', '!', '(', ')', '[', ']'];

function lex(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const col = i + 1;
    const rest = text.slice(i);
    const num = /^(0x[0-9a-f]+|0b[01]+|[0-9]+)(?![A-Za-z0-9_])/i.exec(rest);
    if (num) {
      const s = num[0].toLowerCase();
      out.push({ t: 'num', v: s.startsWith('0x') ? parseInt(s.slice(2), 16) : s.startsWith('0b') ? parseInt(s.slice(2), 2) : parseInt(s, 10), col });
      i += num[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
    if (name) {
      out.push({ t: 'name', v: name[0], col });
      i += name[0].length;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = text.indexOf(ch, i + 1);
      if (end === -1) throw new Fail(col, { th: 'ข้อความไม่มีเครื่องหมายคำพูดปิด', en: 'unterminated string' });
      out.push({ t: 'str', v: text.slice(i + 1, end), col });
      i = end + 1;
      continue;
    }
    const op = OPS.find((o) => rest.startsWith(o));
    if (op) {
      out.push({ t: 'op', v: op, col });
      i += op.length;
      continue;
    }
    if (ch === '=') throw new Fail(col, { th: 'ใช้ == เพื่อเปรียบเทียบ (= ตัวเดียวใช้ไม่ได้)', en: 'use == to compare' });
    if (ch === '&' || ch === '|') throw new Fail(col, { th: `ใช้ ${ch}${ch} (สองตัว)`, en: `use ${ch}${ch}` });
    throw new Fail(col, { th: `ไม่รู้จักอักขระ "${ch}"`, en: `unexpected character "${ch}"` });
  }
  return out;
}

/** แปลงข้อความเป็นต้นไม้ของเงื่อนไข (จำกัดความยาว 500 ตัวอักษร) */
export function parseCondition(text: string): CondParse {
  try {
    if (text.length > 500) throw new Fail(1, { th: 'เงื่อนไขยาวเกิน 500 ตัวอักษร', en: 'condition is longer than 500 characters' });
    const toks = lex(text);
    if (toks.length === 0) throw new Fail(1, { th: 'ยังไม่ได้เขียนเงื่อนไข', en: 'empty condition' });
    let i = 0;
    let depth = 0;
    const peek = (): Tok | undefined => toks[i];
    const isOp = (v: string): boolean => {
      const t = toks[i];
      return !!t && t.t === 'op' && t.v === v;
    };
    const endCol = (): number => text.length + 1;
    const expect = (v: string): void => {
      if (!isOp(v)) throw new Fail(peek()?.col ?? endCol(), { th: `ขาด "${v}"`, en: `missing "${v}"` });
      i++;
    };
    const binary = (next: () => CondNode, ops: string[]) => (): CondNode => {
      let a = next();
      while (ops.some(isOp)) {
        const op = (toks[i++] as Tok).v as string;
        a = { k: 'bin', op, a, b: next() };
      }
      return a;
    };
    const atom = (): CondNode => {
      const t = toks[i++];
      if (!t) throw new Fail(endCol(), { th: 'เงื่อนไขจบไม่ครบ', en: 'unexpected end of condition' });
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'op' && t.v === '(') {
        if (++depth > 32) throw new Fail(t.col, { th: 'วงเล็บซ้อนลึกเกินไป', en: 'too deeply nested' });
        const e = or();
        expect(')');
        depth--;
        return e;
      }
      if (t.t === 'name') {
        if (isOp('(')) {
          i++;
          const arg = toks[i++];
          if (!arg || arg.t !== 'str') throw new Fail(arg?.col ?? endCol(), { th: `${t.v}(...) ต้องใส่ชื่อในเครื่องหมายคำพูด เช่น ${t.v}("alu1.z")`, en: `${t.v}(...) takes a quoted name` });
          expect(')');
          return { k: 'call', name: t.v, arg: arg.v, col: t.col };
        }
        if (isOp('[')) {
          i++;
          const index = or();
          expect(']');
          return { k: 'index', name: t.v, index, col: t.col };
        }
        return { k: 'name', name: t.v, col: t.col };
      }
      throw new Fail(t.col, { th: `ไม่คาดว่าจะเจอ "${t.v}" ตรงนี้`, en: `unexpected "${t.v}"` });
    };
    const unary = (): CondNode => {
      if (isOp('!')) {
        i++;
        return { k: 'not', a: unary() };
      }
      if (isOp('-')) {
        i++;
        return { k: 'neg', a: unary() };
      }
      return atom();
    };
    const sum = binary(unary, ['+', '-']);
    const compare = (): CondNode => {
      const a = sum();
      const op = ['==', '!=', '<=', '>=', '<', '>'].find(isOp);
      if (!op) return a;
      i++;
      return { k: 'bin', op, a, b: sum() };
    };
    const and = binary(compare, ['&&']);
    const or = binary(and, ['||']);
    const ast = or();
    const extra = peek();
    if (extra) throw new Fail(extra.col, { th: `มีข้อความเกินมา "${extra.v}" (ลืม && หรือเปล่า?)`, en: `unexpected "${extra.v}" (missing &&?)` });
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, error: { col: e.col, message: e.text } };
    throw e;
  }
}

class Unknown extends Error {
  constructor(readonly col: number, readonly label: string) {
    super(label);
  }
}

/** ตรวจว่ารู้จักทุกชื่อในเงื่อนไข (ใช้ตอนตั้ง breakpoint จะได้บอกผิดทันที) */
export function checkCondition(ast: CondNode, env: CondEnv): CondError | null {
  try {
    evalNode(ast, env, true);
    return null;
  } catch (e) {
    if (e instanceof Unknown) return { col: e.col, message: { th: `ไม่รู้จัก ${e.label}`, en: `unknown ${e.label}` } };
    throw e;
  }
}

/** ค่าของเงื่อนไข: true/false (ค่า X ในส่วนใดทำให้เป็น false) */
export function evaluateCondition(ast: CondNode, env: CondEnv): boolean {
  try {
    const v = evalNode(ast, env, false);
    return v !== 'X' && v !== 0;
  } catch (e) {
    if (e instanceof Unknown) return false;
    throw e;
  }
}

function evalNode(n: CondNode, env: CondEnv, strict: boolean): number | 'X' {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'name': {
      const v = env.name(n.name);
      if (v === undefined) throw new Unknown(n.col, `"${n.name}"`);
      return v;
    }
    case 'call': {
      const v = env.call?.(n.name, n.arg);
      if (v === undefined) throw new Unknown(n.col, `${n.name}("${n.arg}")`);
      return v;
    }
    case 'index': {
      const idx = evalNode(n.index, env, strict);
      if (idx === 'X') return 'X';
      const v = env.index?.(n.name, idx);
      if (v === undefined) throw new Unknown(n.col, `${n.name}[...]`);
      return v;
    }
    case 'not': {
      const a = evalNode(n.a, env, strict);
      return a === 'X' ? 'X' : a === 0 ? 1 : 0;
    }
    case 'neg': {
      const a = evalNode(n.a, env, strict);
      return a === 'X' ? 'X' : -a;
    }
    case 'bin': {
      const a = evalNode(n.a, env, strict);
      // && และ || ประเมินแบบลัด แต่ตอนตรวจชื่อต้องดูทั้งสองข้าง
      if (!strict && n.op === '&&' && a === 0) return 0;
      if (!strict && n.op === '||' && a !== 0 && a !== 'X') return 1;
      const b = evalNode(n.b, env, strict);
      const yes = (v: number | 'X'): boolean => v !== 'X' && v !== 0;
      if (n.op === '&&') return a === 0 || b === 0 ? 0 : a === 'X' || b === 'X' ? 'X' : 1;
      if (n.op === '||') return yes(a) || yes(b) ? 1 : a === 'X' || b === 'X' ? 'X' : 0;
      if (a === 'X' || b === 'X') return 'X';
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
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

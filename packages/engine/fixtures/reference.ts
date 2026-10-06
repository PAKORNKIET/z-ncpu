// วงจรอ้างอิงที่ต่อจาก NAND ล้วน ใช้ในเทสต์ของ engine และหน้า demo ระหว่างพัฒนา
// import ผ่าน '@z-ncpu/engine/fixtures' เท่านั้น ไม่ได้ export จาก index หลัก จึงไม่ติดไปเป็นเฉลยในแอป
import { circuit, ComponentLibrary, inp, out } from '../src/index';

export function referenceLibrary(): ComponentLibrary {
  const lib = new ComponentLibrary();

  // NOT: 1 NAND ขาทั้งสองต่อกัน
  {
    const b = circuit('user.not', 'NOT', [inp('a'), out('y')]);
    const n = b.add('prim.nand');
    b.wire('self.a', `${n}.a`).wire('self.a', `${n}.b`).wire(`${n}.y`, 'self.y');
    lib.add(b.build());
  }

  // AND = NOT(NAND)
  {
    const b = circuit('user.and', 'AND', [inp('a'), inp('b'), out('y')]);
    const n = b.add('prim.nand');
    const inv = b.add('user.not');
    b.wire('self.a', `${n}.a`).wire('self.b', `${n}.b`).wire(`${n}.y`, `${inv}.a`).wire(`${inv}.y`, 'self.y');
    lib.add(b.build());
  }

  // OR = NAND(NOT a, NOT b)
  {
    const b = circuit('user.or', 'OR', [inp('a'), inp('b'), out('y')]);
    const na = b.add('user.not');
    const nb = b.add('user.not');
    const n = b.add('prim.nand');
    b.wire('self.a', `${na}.a`).wire('self.b', `${nb}.a`);
    b.wire(`${na}.y`, `${n}.a`).wire(`${nb}.y`, `${n}.b`).wire(`${n}.y`, 'self.y');
    lib.add(b.build());
  }

  // XOR แบบ 4 NAND
  {
    const b = circuit('user.xor', 'XOR', [inp('a'), inp('b'), out('y')]);
    const n1 = b.add('prim.nand');
    const n2 = b.add('prim.nand');
    const n3 = b.add('prim.nand');
    const n4 = b.add('prim.nand');
    b.wire('self.a', `${n1}.a`).wire('self.b', `${n1}.b`);
    b.wire('self.a', `${n2}.a`).wire(`${n1}.y`, `${n2}.b`);
    b.wire('self.b', `${n3}.a`).wire(`${n1}.y`, `${n3}.b`);
    b.wire(`${n2}.y`, `${n4}.a`).wire(`${n3}.y`, `${n4}.b`).wire(`${n4}.y`, 'self.y');
    lib.add(b.build());
  }

  // Half Adder
  {
    const b = circuit('user.ha', 'Half Adder', [inp('a'), inp('b'), out('sum'), out('carry')]);
    const x = b.add('user.xor');
    const a = b.add('user.and');
    b.wire('self.a', `${x}.a`).wire('self.b', `${x}.b`).wire('self.a', `${a}.a`).wire('self.b', `${a}.b`);
    b.wire(`${x}.y`, 'self.sum').wire(`${a}.y`, 'self.carry');
    lib.add(b.build());
  }

  // Full Adder = 2 Half Adder + OR
  {
    const b = circuit('user.fa', 'Full Adder', [inp('a'), inp('b'), inp('cin'), out('sum'), out('cout')]);
    const h1 = b.add('user.ha');
    const h2 = b.add('user.ha');
    const o = b.add('user.or');
    b.wire('self.a', `${h1}.a`).wire('self.b', `${h1}.b`);
    b.wire(`${h1}.sum`, `${h2}.a`).wire('self.cin', `${h2}.b`);
    b.wire(`${h1}.carry`, `${o}.a`).wire(`${h2}.carry`, `${o}.b`);
    b.wire(`${h2}.sum`, 'self.sum').wire(`${o}.y`, 'self.cout');
    lib.add(b.build());
  }

  // 4-bit Adder ใช้ bus + splitter/merger
  {
    const b = circuit('user.add4', '4-bit Adder', [inp('a', 4), inp('b', 4), inp('cin'), out('sum', 4), out('cout')]);
    const sa = b.add('prim.split', { params: { width: 4 } });
    const sb = b.add('prim.split', { params: { width: 4 } });
    const ms = b.add('prim.merge', { params: { width: 4 } });
    b.wire('self.a', `${sa}.in`).wire('self.b', `${sb}.in`).wire(`${ms}.out`, 'self.sum');
    let carry = 'self.cin';
    for (let i = 0; i < 4; i++) {
      const fa = b.add('user.fa');
      b.wire(`${sa}.b${i}`, `${fa}.a`).wire(`${sb}.b${i}`, `${fa}.b`).wire(carry, `${fa}.cin`);
      b.wire(`${fa}.sum`, `${ms}.b${i}`);
      carry = `${fa}.cout`;
    }
    b.wire(carry, 'self.cout');
    lib.add(b.build());
  }

  // MUX2: y = sel ? b : a
  {
    const b = circuit('user.mux', 'MUX', [inp('a'), inp('b'), inp('sel'), out('y')]);
    const ns = b.add('user.not');
    const t1 = b.add('prim.nand');
    const t2 = b.add('prim.nand');
    const y = b.add('prim.nand');
    b.wire('self.sel', `${ns}.a`);
    b.wire('self.a', `${t1}.a`).wire(`${ns}.y`, `${t1}.b`);
    b.wire('self.b', `${t2}.a`).wire('self.sel', `${t2}.b`);
    b.wire(`${t1}.y`, `${y}.a`).wire(`${t2}.y`, `${y}.b`).wire(`${y}.y`, 'self.y');
    lib.add(b.build());
  }

  // SR Latch แบบ active-low (มี loop ตั้งใจ)
  {
    const b = circuit('user.srlatch', 'SR Latch', [inp('s_n'), inp('r_n'), out('q'), out('q_n')]);
    const nq = b.add('prim.nand');
    const nqn = b.add('prim.nand');
    b.wire('self.s_n', `${nq}.a`).wire(`${nqn}.y`, `${nq}.b`);
    b.wire('self.r_n', `${nqn}.a`).wire(`${nq}.y`, `${nqn}.b`);
    b.wire(`${nq}.y`, 'self.q').wire(`${nqn}.y`, 'self.q_n');
    lib.add(b.build());
  }

  // D Latch 4 NAND: e = 1 ส่งค่า d ผ่าน, e = 0 จำค่าเดิม
  {
    const b = circuit('user.dlatch', 'D Latch', [inp('d'), inp('e'), out('q')]);
    const n1 = b.add('prim.nand');
    const n2 = b.add('prim.nand');
    const q = b.add('prim.nand');
    const qn = b.add('prim.nand');
    b.wire('self.d', `${n1}.a`).wire('self.e', `${n1}.b`);
    b.wire(`${n1}.y`, `${n2}.a`).wire('self.e', `${n2}.b`);
    b.wire(`${n1}.y`, `${q}.a`).wire(`${qn}.y`, `${q}.b`);
    b.wire(`${n2}.y`, `${qn}.a`).wire(`${q}.y`, `${qn}.b`);
    b.wire(`${q}.y`, 'self.q');
    lib.add(b.build());
  }

  // D Flip-Flop ขอบขาขึ้น แบบ master-slave จาก D Latch 2 ตัว (9 NAND)
  {
    const b = circuit('user.dff', 'D Flip-Flop', [inp('d'), inp('clk'), out('q')]);
    const nclk = b.add('user.not');
    const master = b.add('user.dlatch');
    const slave = b.add('user.dlatch');
    b.wire('self.clk', `${nclk}.a`);
    b.wire('self.d', `${master}.d`).wire(`${nclk}.y`, `${master}.e`);
    b.wire(`${master}.q`, `${slave}.d`).wire('self.clk', `${slave}.e`);
    b.wire(`${slave}.q`, 'self.q');
    lib.add(b.build());
  }

  // Register 1 บิตที่มี load: load = 1 เก็บ in ตอน tick, load = 0 คงค่าเดิม
  {
    const b = circuit('user.bit', 'Bit', [inp('in'), inp('load'), inp('clk'), out('out')]);
    const m = b.add('user.mux');
    const ff = b.add('user.dff');
    b.wire(`${ff}.q`, `${m}.a`).wire('self.in', `${m}.b`).wire('self.load', `${m}.sel`);
    b.wire(`${m}.y`, `${ff}.d`).wire('self.clk', `${ff}.clk`).wire(`${ff}.q`, 'self.out');
    lib.add(b.build());
  }

  // Incrementer 4 บิต: y = a + 1 (ปัดรอบที่ 16)
  {
    const b = circuit('user.inc4', 'Incrementer', [inp('a', 4), out('y', 4)]);
    const sa = b.add('prim.split', { params: { width: 4 } });
    const my = b.add('prim.merge', { params: { width: 4 } });
    const one = b.add('prim.const1');
    b.wire('self.a', `${sa}.in`).wire(`${my}.out`, 'self.y');
    let carry = `${one}.y`;
    for (let i = 0; i < 4; i++) {
      const ha = b.add('user.ha');
      b.wire(`${sa}.b${i}`, `${ha}.a`).wire(carry, `${ha}.b`).wire(`${ha}.sum`, `${my}.b${i}`);
      carry = `${ha}.carry`;
    }
    lib.add(b.build());
  }

  // Counter 4 บิตพร้อม reset: q นับขึ้นทีละ 1 ทุก tick (ทั้งวงจรเป็น loop ผ่าน register)
  {
    const b = circuit('user.counter4', 'Counter', [inp('reset'), inp('clk'), out('q', 4)]);
    const one = b.add('prim.const1');
    const nrst = b.add('user.not');
    const inc = b.add('user.inc4');
    const si = b.add('prim.split', { params: { width: 4 } });
    const mq = b.add('prim.merge', { params: { width: 4 } });
    b.wire('self.reset', `${nrst}.a`);
    b.wire(`${mq}.out`, 'self.q').wire(`${mq}.out`, `${inc}.a`).wire(`${inc}.y`, `${si}.in`);
    for (let i = 0; i < 4; i++) {
      const gate = b.add('user.and');
      const bit = b.add('user.bit');
      b.wire(`${si}.b${i}`, `${gate}.a`).wire(`${nrst}.y`, `${gate}.b`);
      b.wire(`${gate}.y`, `${bit}.in`).wire(`${one}.y`, `${bit}.load`).wire('self.clk', `${bit}.clk`);
      b.wire(`${bit}.out`, `${mq}.b${i}`);
    }
    lib.add(b.build());
  }

  // ---------- ROM ที่ผู้เล่นต่อเอง (Spec ส่วน 11) ----------

  // MUX 16 บิต: out = sel ? b : a (MUX 1 บิต 16 ตัวใช้ sel ร่วมกัน)
  {
    const b = circuit('user.mux16', 'MUX 16 บิต', [inp('a', 16), inp('b', 16), inp('sel'), out('out', 16)]);
    const sa = b.add('prim.split', { params: { width: 16 } });
    const sb = b.add('prim.split', { params: { width: 16 } });
    const mo = b.add('prim.merge', { params: { width: 16 } });
    b.wire('self.a', `${sa}.in`).wire('self.b', `${sb}.in`).wire(`${mo}.out`, 'self.out');
    for (let i = 0; i < 16; i++) {
      const m = b.add('user.mux');
      b.wire(`${sa}.b${i}`, `${m}.a`).wire(`${sb}.b${i}`, `${m}.b`).wire('self.sel', `${m}.sel`).wire(`${m}.y`, `${mo}.b${i}`);
    }
    lib.add(b.build());
  }

  // เลือก 1 ใน 2^k คำ ขนาด 16 บิต ด้วยต้นไม้ของ MUX 16 บิต (บิต 0 ของ sel เลือกชั้นล่างสุด)
  const muxTree = (id: string, k: number): void => {
    const n = 2 ** k;
    const pins = [...Array.from({ length: n }, (_, i) => inp(`w${i}`, 16)), inp('sel', k), out('out', 16)];
    const b = circuit(id, `เลือก 1 ใน ${n} (16 บิต)`, pins);
    const ss = b.add('prim.split', { params: { width: k } });
    b.wire('self.sel', `${ss}.in`);
    let level = Array.from({ length: n }, (_, i) => `self.w${i}`);
    for (let bit = 0; bit < k; bit++) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const m = b.add('user.mux16');
        b.wire(level[i] as string, `${m}.a`).wire(level[i + 1] as string, `${m}.b`).wire(`${ss}.b${bit}`, `${m}.sel`);
        next.push(`${m}.out`);
      }
      level = next;
    }
    b.wire(level[0] as string, 'self.out');
    lib.add(b.build());
  };
  muxTree('user.sel4x16', 2);
  muxTree('user.sel8x16', 3);

  // ROM8: data คือมัดสาย 8 คำ × 16 บิต จากแผงค่าคงที่ addr เลือกคำ
  {
    const b = circuit('user.rom8', 'ROM 8 คำ', [inp('addr', 3), inp('data', 128), out('out', 16)]);
    const sd = b.add('prim.split', { params: { width: 128, parts: 8 } });
    const sel = b.add('user.sel8x16');
    b.wire('self.data', `${sd}.in`).wire('self.addr', `${sel}.sel`).wire(`${sel}.out`, 'self.out');
    for (let i = 0; i < 8; i++) b.wire(`${sd}.b${i}`, `${sel}.w${i}`);
    lib.add(b.build());
  }

  // ROM ซ้อนชั้น: ROM ใหญ่ = ROM เล็ก 2^k ตัว + ตัวเลือกคำ ใช้ addr บิตบนเลือกว่าคำมาจาก ROM เล็กตัวไหน
  const romStack = (id: string, childId: string, childAddr: number, k: number): void => {
    const addrBits = childAddr + k;
    const n = 2 ** k;
    const dataWidth = 16 * 2 ** addrBits;
    const b = circuit(id, `ROM ${2 ** addrBits} คำ`, [inp('addr', addrBits), inp('data', dataWidth), out('out', 16)]);
    const sd = b.add('prim.split', { params: { width: dataWidth, parts: n } });
    const sa = b.add('prim.split', { params: { width: addrBits } });
    const lo = b.add('prim.merge', { params: { width: childAddr } });
    const hi = b.add('prim.merge', { params: { width: k } });
    const sel = b.add(k === 2 ? 'user.sel4x16' : 'user.sel8x16');
    b.wire('self.data', `${sd}.in`).wire('self.addr', `${sa}.in`);
    for (let i = 0; i < childAddr; i++) b.wire(`${sa}.b${i}`, `${lo}.b${i}`);
    for (let i = 0; i < k; i++) b.wire(`${sa}.b${childAddr + i}`, `${hi}.b${i}`);
    b.wire(`${hi}.out`, `${sel}.sel`).wire(`${sel}.out`, 'self.out');
    for (let i = 0; i < n; i++) {
      const rom = b.add(childId);
      b.wire(`${sd}.b${i}`, `${rom}.data`).wire(`${lo}.out`, `${rom}.addr`).wire(`${rom}.out`, `${sel}.w${i}`);
    }
    lib.add(b.build());
  };
  romStack('user.rom64', 'user.rom8', 3, 3);
  romStack('user.rom256', 'user.rom64', 6, 2);

  // ทดสอบ: แผงค่าคงที่ 256 คำ ต่อเข้า ROM256 ที่ผู้เล่นต่อเอง
  {
    const b = circuit('test.progrom', 'แผงโปรแกรม + ROM', [inp('addr', 8), out('out', 16)]);
    const panel = b.add('prim.panel', { id: 'panel', params: { words: 256, width: 16 } });
    const rom = b.add('user.rom256', { id: 'rom' });
    b.wire(`${panel}.out`, `${rom}.data`).wire('self.addr', `${rom}.addr`).wire(`${rom}.out`, 'self.out');
    lib.add(b.build());
  }

  // วงจรสั่นไม่หยุด: y = NAND(en, y) เมื่อ en = 1
  {
    const b = circuit('test.osc', 'Ring oscillator', [inp('en'), out('y')]);
    const n = b.add('prim.nand');
    b.wire('self.en', `${n}.a`).wire(`${n}.y`, `${n}.b`).wire(`${n}.y`, 'self.y');
    lib.add(b.build());
  }

  return lib;
}

/** จำนวน NAND ที่คาดไว้ของแต่ละวงจร (ใช้ยืนยันว่า flatten ไม่ทำเกตหายหรือเกิน) */
export const EXPECTED_NAND: Record<string, number> = {
  'user.not': 1,
  'user.and': 2,
  'user.or': 3,
  'user.xor': 4,
  'user.ha': 6,
  'user.fa': 15,
  'user.add4': 60,
  'user.mux': 4,
  'user.srlatch': 2,
  'user.dlatch': 4,
  'user.dff': 9,
  'user.bit': 13,
  'user.inc4': 24,
  'user.counter4': 1 + 24 + 4 * (2 + 13),
  'user.mux16': 64,
  'user.sel4x16': 3 * 64,
  'user.sel8x16': 7 * 64,
  'user.rom8': 7 * 64,
  'user.rom64': 63 * 64,
  // 255 MUX 16 บิต = 16,320 NAND ตรงกับที่ประเมินไว้ในเอกสาร
  'user.rom256': 255 * 64,
  'test.progrom': 255 * 64,
};

// Integration: โปรแกรม Z8 ที่ encode ด้วย @z-ncpu/isa ใส่แผงค่าคงที่ แล้วอ่านกลับผ่าน ROM ที่ต่อจาก NAND
import { compile, createSimulator } from '@z-ncpu/engine';
import { referenceLibrary } from '@z-ncpu/engine/fixtures';
import { decode, encode, formatDecoded, Z8 } from '@z-ncpu/isa';
import { describe, expect, it } from 'vitest';

describe('โปรแกรมนับ 0 ถึง 9 ใน ROM ที่ผู้เล่นต่อเอง', () => {
  it('อ่านทุกคำสั่งกลับได้ตรง และ decode เป็น assembly เดิม', () => {
    const program = [
      encode(Z8, { mnemonic: 'MOV', rd: 'A', src: { imm: 0 } }),
      encode(Z8, { mnemonic: 'STORE', rd: 'A', src: { imm: 0xf0 } }),
      encode(Z8, { mnemonic: 'ADD', rd: 'A', src: { imm: 1 } }),
      encode(Z8, { mnemonic: 'CMP', rd: 'A', src: { imm: 10 } }),
      encode(Z8, { mnemonic: 'JNZ', src: { imm: 1 } }),
      encode(Z8, { mnemonic: 'HALT' }),
    ];
    const { netlist } = compile(referenceLibrary(), 'test.progrom');
    const sim = createSimulator(netlist!, 'fast');
    sim.loadPanel(program);
    const listing: string[] = [];
    for (let pc = 0; pc < program.length; pc++) {
      sim.setInput('addr', pc);
      sim.settle();
      const word = sim.read('out') as number;
      expect(word).toBe(program[pc]);
      listing.push(formatDecoded(decode(Z8, word)!));
    }
    expect(listing).toEqual(['MOV A, 0x00', 'STORE [0xF0], A', 'ADD A, 0x01', 'CMP A, 0x0A', 'JNZ 0x01', 'HALT']);
  });
});

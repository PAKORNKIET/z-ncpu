// emulator ของ isa กับ reference ของ engine ต้องตรงกันทุกกรณี (สองแพ็กเกจ import กันไม่ได้ตามกฎ dependency จึงตรวจที่นี่)
import { REFERENCES, SEG7 } from '@z-ncpu/engine';
import { SEG7_PATTERNS, z8Alu } from '@z-ncpu/isa';
import { describe, expect, it } from 'vitest';

describe('ALU ของ emulator = ref.alu8 ของ engine', () => {
  it('ครบทุก a, b, op (2^19 กรณี)', () => {
    const ref = REFERENCES.alu8!;
    let mismatches = 0;
    for (let op = 0; op < 8; op++) {
      for (let a = 0; a < 256; a++) {
        for (let b = 0; b < 256; b++) {
          const r = ref({ a, b, op });
          const e = z8Alu(a, b, op);
          if (r.y !== e.y || r.z !== e.z || r.c !== e.c || r.n !== e.n) mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  });

  it('ตาราง 7-segment ตรงกัน', () => {
    expect([...SEG7_PATTERNS]).toEqual([...SEG7]);
  });
});

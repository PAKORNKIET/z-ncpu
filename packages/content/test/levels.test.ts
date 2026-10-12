// Level CI (Spec ส่วน 17): ทุกด่านต้องเล่นผ่านได้จริงด้วยเฉลยอ้างอิง
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentLibrary, compile, contentHash, testComponent } from '@z-ncpu/engine';
import { assemble, checkExtension, isaOfSuite, makeOracle, Z8_ORACLE } from '@z-ncpu/isa';
import type { ComponentDef } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, HINTS_TH, LEVELS, term } from '../src';

const root = join(import.meta.dirname, '..');
const solution = (levelId: string): ComponentDef =>
  JSON.parse(readFileSync(join(root, 'solutions', `${levelId}.json`), 'utf8')) as ComponentDef;

describe('Level CI', () => {
  // ผู้เล่นได้ชิ้นใหม่ทีละด่าน คลังจึงสะสมตามลำดับด่าน
  const lib = new ComponentLibrary();

  for (const level of LEVELS) {
    if (level.tests.type === 'program') {
      const suite = level.tests;
      describe(level.id, () => {
        // รันโปรแกรมบน CPU 55,000 NAND หลายร้อย cycle ทั้งสองโหมด ด่านบท 9 ใช้เวลาหลายวินาที (เครื่อง CI ช้ากว่านี้อีก)
        it('เฉลย (โปรแกรม) ผ่านบน CPU ที่ต่อจาก NAND ทั้ง Visual Mode และ Fast Mode', { timeout: 120_000 }, () => {
          const { source } = JSON.parse(readFileSync(join(root, 'solutions', `${level.id}.json`), 'utf8')) as { source: string };
          const asm = assemble(source);
          expect(asm.diagnostics).toEqual([]);
          for (const mode of ['visual', 'fast'] as const) {
            const { report, diagnostics } = testComponent(lib, suite.cpu, { ...suite, words: asm.words }, mode, undefined, Z8_ORACLE);
            expect(diagnostics).toEqual([]);
            expect(report?.results.filter((r) => !r.ok)).toEqual([]);
            expect(report?.passed).toBe(true);
          }
        });
        it('มีบทเรียนทั้งไทยและอังกฤษ และคำใบ้ภาษาไทยครบ', () => {
          for (const lang of ['th', 'en']) {
            expect(readFileSync(join(root, 'lessons', lang, `${level.lesson}.md`), 'utf8').length).toBeGreaterThan(50);
          }
          for (const h of level.hints) expect(HINTS_TH[h]).toBeTruthy();
        });
      });
      continue;
    }
    describe(level.id, () => {
      const sol = solution(level.id);

      it('เฉลยตรงกับ pin ที่ด่านกำหนด', () => {
        expect(sol.id).toBe(level.target.defId);
        expect(sol.pins).toEqual(level.target.pins);
      });

      it('เฉลยใช้เฉพาะชิ้นที่ด่านอนุญาต', () => {
        for (const inst of sol.body?.instances ?? []) expect(level.available).toContain(inst.defId);
      });

      it('เฉลยผ่านเทสต์ทั้ง Visual Mode และ Fast Mode', { timeout: 60_000 }, () => {
        lib.add(sol);
        // ด่านที่เพิ่มคำสั่งเอง: emulator อ้างอิงต้องรู้จักคำสั่งนั้นด้วย
        const oracle = makeOracle(isaOfSuite(level.tests));
        for (const mode of ['visual', 'fast'] as const) {
          const { report, diagnostics } = testComponent(lib, sol.id, level.tests, mode, undefined, oracle);
          expect(diagnostics).toEqual([]);
          expect(report?.passed).toBe(true);
        }
        expect(contentHash(lib, sol.id)).toMatch(/^[0-9a-f]{14}$/);
      });

      it('จำนวน NAND ของเฉลยเท่ากับค่าที่ดีที่สุดที่ด่านระบุ', () => {
        const best = level.optimize?.bestNand;
        if (best !== undefined) expect(compile(lib, sol.id).netlist?.gateCount).toBe(best);
      });

      it('มีบทเรียนทั้งไทยและอังกฤษ และคำใบ้ภาษาไทยครบ', () => {
        for (const lang of ['th', 'en']) {
          expect(readFileSync(join(root, 'lessons', lang, `${level.lesson}.md`), 'utf8').length).toBeGreaterThan(50);
        }
        for (const h of level.hints) expect(HINTS_TH[h]).toBeTruthy();
      });
    });
  }

  it('ด่านที่เพิ่มคำสั่งเอง: ISA ของด่านไม่มีข้อผิดพลาด และ CPU เดิมที่ไม่มีคำสั่งนั้นไม่ผ่าน', { timeout: 60_000 }, () => {
    const levels = LEVELS.filter((l) => l.tests.type === 'cpu' && l.tests.isa);
    expect(levels.map((l) => l.id)).toEqual(['adv.shr']);
    for (const level of levels) {
      if (level.tests.type !== 'cpu') continue;
      expect(checkExtension(level.tests.isa!).issues).toEqual([]);
      expect(level.startFrom).toBe('user.cpu');
      // CPU ของบท 7 (ไม่มี SHR) ต้องไม่ผ่านด่านนี้ ถ้าเปลี่ยนแค่ id
      const old = { ...solution('cpu.z8'), id: level.target.defId };
      const { report } = testComponent(new ComponentLibrary([...lib.all().filter((d) => d.id !== old.id), old]), old.id, level.tests, 'fast', undefined, makeOracle(isaOfSuite(level.tests)));
      expect(report?.passed).toBe(false);
      expect(report?.firstFailure?.cpu?.instruction).toBe('SHR A');
    }
  });

  it('ทุกด่านมีไฟล์เฉลย และไม่มีเฉลยที่ไม่มีด่าน', () => {
    const files = readdirSync(join(root, 'solutions')).map((f) => f.replace(/\.json$/, ''));
    expect(files.sort()).toEqual(LEVELS.map((l) => l.id).sort());
  });

  it('ศัพท์ใน glossary แสดงเป็น ไทย (English)', () => {
    expect(term('program-counter')).toBe('ตัวนับโปรแกรม (Program Counter (PC))');
    for (const level of LEVELS) for (const g of level.glossary) expect(GLOSSARY.map((e) => e.id)).toContain(g);
  });
});

describe('โปรแกรมตัวอย่าง', () => {
  it('assemble ผ่านทุกตัว และ id ไม่ซ้ำ', async () => {
    const { EXAMPLE_PROGRAMS } = await import('../src');
    const { assemble } = await import('@z-ncpu/isa');
    for (const p of EXAMPLE_PROGRAMS) expect(assemble(p.source).diagnostics, p.id).toEqual([]);
    expect(new Set(EXAMPLE_PROGRAMS.map((p) => p.id)).size).toBe(EXAMPLE_PROGRAMS.length);
  });
});

// Level CI (Spec ส่วน 17): ทุกด่านต้องเล่นผ่านได้จริงด้วยเฉลยอ้างอิง
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ComponentLibrary, compile, contentHash, testComponent } from '@z-ncpu/engine';
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
    describe(level.id, () => {
      const sol = solution(level.id);

      it('เฉลยตรงกับ pin ที่ด่านกำหนด', () => {
        expect(sol.id).toBe(level.target.defId);
        expect(sol.pins).toEqual(level.target.pins);
      });

      it('เฉลยใช้เฉพาะชิ้นที่ด่านอนุญาต', () => {
        for (const inst of sol.body?.instances ?? []) expect(level.available).toContain(inst.defId);
      });

      it('เฉลยผ่านเทสต์ทั้ง Visual Mode และ Fast Mode', () => {
        lib.add(sol);
        for (const mode of ['visual', 'fast'] as const) {
          const { report, diagnostics } = testComponent(lib, sol.id, level.tests, mode);
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

  it('ทุกด่านมีไฟล์เฉลย และไม่มีเฉลยที่ไม่มีด่าน', () => {
    const files = readdirSync(join(root, 'solutions')).map((f) => f.replace(/\.json$/, ''));
    expect(files.sort()).toEqual(LEVELS.map((l) => l.id).sort());
  });

  it('ศัพท์ใน glossary แสดงเป็น ไทย (English)', () => {
    expect(term('program-counter')).toBe('ตัวนับโปรแกรม (Program Counter (PC))');
    for (const level of LEVELS) for (const g of level.glossary) expect(GLOSSARY.map((e) => e.id)).toContain(g);
  });
});

// AI Tutor (M5-4): คำขอไปผู้ให้บริการ, การอ่านคำตอบ, ข้อความที่ส่ง และการเก็บคีย์
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComponentDef, TestReport } from '@z-ncpu/shared';
import { describe, expect, it } from 'vitest';
import {
  askTutor,
  buildRequest,
  circuitSummary,
  DEFAULT_SETTINGS,
  forgetKeys,
  getKey,
  loadSettings,
  parseAnswer,
  programSummary,
  PROVIDERS,
  reportSummary,
  setKey,
  storeSettings,
  systemPrompt,
  TutorError,
  userMessage,
  type KeyValue,
  type ProviderId,
} from '../apps/web/src/tutor/tutor';

const memStore = (): KeyValue & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

const req = (provider: ProviderId) => ({ provider, model: PROVIDERS[provider].defaultModel, key: 'sk-test', system: 'SYS', user: 'USER' });

describe('คำขอไปผู้ให้บริการ', () => {
  it('ไปที่ host ของผู้ให้บริการเท่านั้น คีย์อยู่ใน header ไม่อยู่ใน URL', () => {
    for (const p of ['openai', 'anthropic', 'gemini'] as const) {
      const { url, init } = buildRequest(req(p));
      expect(new URL(url).host).toBe(PROVIDERS[p].host);
      expect(new URL(url).protocol).toBe('https:');
      expect(url).not.toContain('sk-test');
      expect(JSON.stringify(init.headers)).toContain('sk-test');
      expect(init.credentials).toBe('omit');
      expect(init.referrerPolicy).toBe('no-referrer');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(JSON.stringify(body)).toContain('SYS');
      expect(JSON.stringify(body)).toContain('USER');
    }
    expect(buildRequest(req('anthropic')).init.headers).toMatchObject({ 'anthropic-dangerous-direct-browser-access': 'true', 'x-api-key': 'sk-test' });
    expect(buildRequest(req('openai')).init.headers).toMatchObject({ authorization: 'Bearer sk-test' });
    expect(buildRequest(req('gemini')).url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
  });

  it('ชื่อโมเดลแปลกๆ ใช้ไม่ได้ (กันการแก้ path ของ URL)', () => {
    expect(() => buildRequest({ ...req('gemini'), model: '../../evil' })).toThrow(TutorError);
    expect(() => buildRequest({ ...req('gemini'), model: 'a?key=x' })).toThrow(TutorError);
    expect(() => buildRequest({ ...req('gemini'), model: '' })).toThrow(TutorError);
  });

  it('อ่านคำตอบของแต่ละผู้ให้บริการ', () => {
    expect(parseAnswer('openai', { output: [{ type: 'reasoning', content: [] }, { type: 'message', content: [{ type: 'output_text', text: 'สวัสดี' }] }] })).toBe('สวัสดี');
    expect(parseAnswer('openai', { output_text: ' ตรงๆ ' })).toBe('ตรงๆ');
    expect(parseAnswer('anthropic', { content: [{ type: 'text', text: 'ก' }, { type: 'tool_use' }, { type: 'text', text: 'ข' }] })).toBe('กข');
    expect(parseAnswer('gemini', { candidates: [{ content: { parts: [{ text: 'คิด', thought: true }, { text: 'ตอบ' }] } }] })).toBe('ตอบ');
    expect(() => parseAnswer('gemini', { candidates: [] })).toThrow(/ไม่ได้ส่งคำตอบ/);
    expect(() => parseAnswer('openai', 'x')).toThrow(TutorError);
  });

  it('askTutor: ส่งแล้วได้คำตอบ และแปล error เป็นภาษาไทย', async () => {
    const calls: string[] = [];
    const ok = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ลองดูขา b' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await askTutor(req('anthropic'), ok)).toBe('ลองดูขา b');
    expect(calls).toEqual(['https://api.anthropic.com/v1/messages']);

    const status = (code: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status: code })) as unknown as typeof fetch;
    await expect(askTutor(req('openai'), status(401, { error: { message: 'Incorrect API key' } }))).rejects.toThrow('คีย์ API ใช้ไม่ได้หรือไม่มีสิทธิ์ ตรวจคีย์ของ OpenAI อีกครั้ง (Incorrect API key)');
    await expect(askTutor(req('gemini'), status(404, {}))).rejects.toThrow('ไม่พบโมเดล "gemini-3.6-flash"');
    await expect(askTutor(req('gemini'), status(429, { error: { message: 'x'.repeat(500) } }))).rejects.toThrow(/โควตา.*\(x{200}\)$/);
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(askTutor(req('openai'), offline)).rejects.toThrow('ติดต่อ api.openai.com ไม่ได้');
    await expect(askTutor({ ...req('openai'), key: '  ' }, ok)).rejects.toThrow('ยังไม่ได้ใส่คีย์ API');
  });
});

describe('ข้อความที่ส่งให้ติวเตอร์', () => {
  const not = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'packages', 'content', 'solutions', 'logic.not.json'), 'utf8')) as ComponentDef;

  it('สรุปวงจร: ขา ชิ้นส่วน และสาย ไม่มีตำแหน่งบนจอ', () => {
    const s = circuitSummary(not, 1);
    expect(s).toContain('ขาของวงจร: a (เข้า), y (ออก)');
    expect(s).toContain('จำนวน NAND: 1');
    expect(s).toContain('self.a → ');
    expect(s).not.toMatch(/"x"|x:/);
    const many = { ...not, body: { ...not.body!, wires: Array.from({ length: 100 }, (_, i) => ({ id: `w${i}`, from: { inst: 'self', pin: 'a' }, to: { inst: 'n', pin: 'a' } })) } };
    expect(circuitSummary(many, null, 10)).toContain('…และอีก 90 เส้น');
  });

  it('สรุปผลทดสอบ: แถวที่ผิด, CPU ไม่ตรงกับ emulator และยังไม่ได้ทดสอบ', () => {
    expect(reportSummary(null)).toBe('ยังไม่ได้ทดสอบ');
    const rows: TestReport = {
      passed: false,
      total: 2,
      failed: 1,
      results: [
        { index: 0, ok: true, inputs: { a: 0 }, expected: { y: 1 }, actual: { y: 1 } },
        { index: 1, ok: false, inputs: { a: 1 }, expected: { y: 0 }, actual: { y: 1 } },
      ],
    };
    expect(reportSummary(rows)).toBe('ผิด 1 จาก 2 กรณี\nแถว/ขั้นที่ 2: เข้า a=1 · ต้องได้ y=0 · ได้ y=1');
    const cpu: TestReport = {
      passed: false,
      total: 1,
      failed: 1,
      results: [{ index: 0, ok: false, inputs: {}, expected: { a: 6, b: 0 }, actual: { a: 5, b: 0 }, cpu: { program: 0, cycle: 2, pc: 1, instruction: 'INC A' } }],
    };
    expect(reportSummary(cpu)).toContain('CPU ไม่ตรงกับ emulator ที่ cycle 2 หลังคำสั่ง INC A: a ต้องได้ 6 แต่ได้ 5');
    expect(reportSummary({ passed: true, total: 4, failed: 0, results: [] })).toBe('ผ่านทั้งหมด 4 กรณี');
  });

  it('โปรแกรมมีเลขบรรทัดและ error ของ assembler', () => {
    const s = programSummary('MOV A, 1\nADDD A, 2', [{ line: 2, col: 1, message: { th: 'ไม่รู้จักคำสั่ง "ADDD"' } }]);
    expect(s).toContain('  1| MOV A, 1');
    expect(s).toContain('assembler: บรรทัด 2 คอลัมน์ 1: ไม่รู้จักคำสั่ง "ADDD"');
  });

  it('ข้อความรวมมีครบทุกหัวข้อ จำกัดความยาว และไม่ให้เฉลยตามระดับที่เลือก', () => {
    const msg = userMessage({ place: 'ด่าน NOT', goal: 'สร้าง NOT', work: 'w'.repeat(10_000), result: 'ยังไม่ได้ทดสอบ' }, '');
    expect(msg.startsWith('## ตำแหน่งในเกม\nด่าน NOT')).toBe(true);
    expect(msg.length).toBeLessThanOrEqual(6100);
    expect(msg).toContain('ตัดส่วนที่เหลือ');
    expect(userMessage({ place: '', goal: '', work: '', result: '' }, ' ทำไม y ไม่เปลี่ยน ')).toContain('## คำถาม\nทำไม y ไม่เปลี่ยน');
    expect(systemPrompt('hint')).toContain('คำใบ้ถัดไปเพียงหนึ่งข้อ');
    expect(systemPrompt('explain')).toContain('อธิบายแนวคิด');
    for (const l of ['hint', 'explain'] as const) expect(systemPrompt(l)).toContain('ห้ามให้วงจรเฉลยครบ');
  });
});

describe('การตั้งค่าและคีย์', () => {
  it('ค่าเริ่มต้นปิดอยู่ ข้อมูลเสียกลับเป็นค่าเริ่มต้น', () => {
    const s = memStore();
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.enabled).toBe(false);
    s.setItem('zncpu.tutor', '{bad');
    expect(loadSettings(s).enabled).toBe(false);
    s.setItem('zncpu.tutor', JSON.stringify({ enabled: 'yes', provider: 'evil', models: { gemini: '../x', openai: 'gpt-x' }, help: 'all' }));
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, openai: 'gpt-x' } });
    storeSettings(s, { ...DEFAULT_SETTINGS, enabled: true, provider: 'anthropic', help: 'explain' });
    expect(loadSettings(s)).toMatchObject({ enabled: true, provider: 'anthropic', help: 'explain' });
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('คีย์: ปกติจำแค่ในหน่วยความจำ เลือกจำในเครื่องจึงเขียนลงที่เก็บ และปิดแล้วลบหมด', () => {
    const s = memStore();
    setKey(s, 'openai', ' sk-1 ', false);
    expect(getKey(s, 'openai')).toBe('sk-1');
    expect(s.data.size).toBe(0);
    setKey(s, 'gemini', 'g-1', true);
    expect(s.data.get('zncpu.tutor.key.gemini')).toBe('g-1');
    // เปลี่ยนใจไม่จำ: ลบออกจากเครื่อง
    setKey(s, 'gemini', 'g-1', false);
    expect(s.data.has('zncpu.tutor.key.gemini')).toBe(false);
    setKey(s, 'anthropic', 'a-1', true);
    forgetKeys(s);
    expect(getKey(s, 'openai')).toBe('');
    expect(getKey(s, 'anthropic')).toBe('');
    expect(s.data.size).toBe(0);
  });
});

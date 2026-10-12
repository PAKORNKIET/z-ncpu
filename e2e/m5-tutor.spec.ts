// M5-4: AI ติวเตอร์ ปิดไว้เป็นค่าเริ่มต้น ใช้คีย์ของผู้เล่นเอง ส่งแค่สรุปโจทย์ งาน และผลทดสอบ
// ไม่ติดต่อผู้ให้บริการจริง: ดักคำขอด้วย page.route แล้วตอบแทน
import { expect, test, type Page, type Request } from '@playwright/test';
import { before, levelNamed, openWithSave, watchErrors } from './helpers';

let check: () => void;
let aiRequests: Request[];
test.beforeEach(({ page }) => {
  check = watchErrors(page);
  aiRequests = [];
  page.on('request', (r) => {
    if (/api\.openai\.com|api\.anthropic\.com|googleapis\.com/.test(r.url())) aiRequests.push(r);
  });
});
test.afterEach(() => check());

const tutor = (page: Page) => page.locator('details.tutor').first();

async function openTutor(page: Page) {
  await tutor(page).locator('summary').first().click();
}

async function setup(page: Page, provider: string, key: string, remember = false) {
  await page.getByRole('button', { name: /ตั้งค่าและเปิดใช้|^ตั้งค่า$/ }).click();
  await page.getByRole('combobox', { name: 'ผู้ให้บริการ AI' }).selectOption({ label: provider });
  await page.getByLabel('คีย์ API', { exact: true }).fill(key);
  if (remember) await page.getByRole('checkbox', { name: /จำคีย์ไว้ในเครื่องนี้/ }).check();
  await page.getByRole('button', { name: 'บันทึกและเปิดใช้' }).click();
}

test('ปิดไว้เป็นค่าเริ่มต้น: บอกว่าจะส่งอะไร และไม่มีการติดต่อผู้ให้บริการเลย', async ({ page }) => {
  await openWithSave(page, []);
  await expect(tutor(page)).toContainText('(ปิดอยู่)');
  await openTutor(page);
  await expect(tutor(page)).toContainText('ปิดไว้เป็นค่าเริ่มต้น');
  await expect(tutor(page).getByRole('button', { name: /^ส่งไป/ })).toHaveCount(0);
  // ใส่คีย์ว่างไม่ได้
  await page.getByRole('button', { name: 'ตั้งค่าและเปิดใช้' }).click();
  await page.getByRole('button', { name: 'บันทึกและเปิดใช้' }).click();
  await expect(tutor(page).getByRole('alert')).toHaveText('ใส่คีย์ API ก่อน');
  await page.getByRole('button', { name: 'ยกเลิก' }).click();
  await expect(tutor(page)).toContainText('(ปิดอยู่)');
  expect(aiRequests).toEqual([]);
});

test('Gemini: ส่งสรุปด่านกับวงจร ได้คำตอบเป็น Markdown และคีย์ที่ไม่ได้ให้จำหายเมื่อรีโหลด', async ({ page }) => {
  let body = '';
  let headers: Record<string, string> = {};
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    body = route.request().postData() ?? '';
    headers = route.request().headers();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ลองดูว่า **ขา b** ของ NAND ต่อกับอะไร\n\n- ถ้า `a = 1` แล้ว y เป็นเท่าไร' }] } }] }),
    });
  });
  await openWithSave(page, [], ['logic.not']);
  await openTutor(page);
  await setup(page, 'Google Gemini', 'AIza-test-key');
  await expect(tutor(page)).toContainText('(Google Gemini)');

  await page.getByRole('textbox', { name: 'คำถามถึงติวเตอร์' }).fill('ทำไมผ่านแล้ว');
  await tutor(page).getByText('ดูข้อความที่จะส่ง').click();
  const preview = page.getByTestId('tutor-preview');
  await expect(preview).toContainText('ด่าน "สร้าง NOT" บทที่ 1');
  await expect(preview).toContainText('self.a → n1.a');
  await expect(preview).toContainText('ยังไม่ได้ทดสอบ');
  await expect(preview).toContainText('## คำถาม\nทำไมผ่านแล้ว');

  await page.getByRole('button', { name: 'ส่งไป generativelanguage.googleapis.com' }).click();
  const answer = page.getByTestId('tutor-answer');
  await expect(answer.locator('strong')).toHaveText('ขา b');
  await expect(answer.locator('li code')).toHaveText('a = 1');
  expect(headers['x-goog-api-key']).toBe('AIza-test-key');
  expect(aiRequests.map((r) => new URL(r.url()).pathname)).toEqual(['/v1beta/models/gemini-3.6-flash:generateContent']);
  expect(aiRequests[0]!.url()).not.toContain('AIza');
  const sent = JSON.parse(body) as { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[] };
  expect(sent.systemInstruction.parts[0]!.text).toContain('ห้ามให้วงจรเฉลยครบ');
  expect(sent.contents[0]!.parts[0]!.text).toBe(await preview.textContent());
  // ไม่ส่งไฟล์บันทึกไปด้วย
  expect(body).not.toContain('zncpu');
  expect(body).not.toContain('passedHash');

  // คีย์ไม่ได้เลือกให้จำ: ไม่อยู่ในเครื่อง และหายหลังรีโหลด (การตั้งค่าอื่นยังอยู่)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('zncpu.tutor.key')))).toEqual([]);
  await page.reload();
  await openTutor(page);
  await page.getByRole('button', { name: 'ส่งไป generativelanguage.googleapis.com' }).click();
  await expect(page.getByTestId('tutor-answer')).toContainText('ยังไม่ได้ใส่คีย์ API');
});

test('Anthropic: คีย์ผิดบอกเป็นภาษาไทย · จำคีย์ได้ และปิดติวเตอร์แล้วคีย์ถูกลบ', async ({ page }) => {
  // เบราว์เซอร์เขียน "status of 401" ลง console เองเมื่อ API ตอบ 401 (คาดไว้แล้ว) error อื่นยังต้องไม่มี
  page.removeAllListeners('console');
  page.removeAllListeners('pageerror');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(m.text());
  });
  check = () => expect(errors).toEqual([]);
  let headers: Record<string, string> = {};
  await page.route('https://api.anthropic.com/**', async (route) => {
    headers = route.request().headers();
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    });
  });
  await openWithSave(page, []);
  await openTutor(page);
  await setup(page, 'Anthropic (Claude)', 'sk-ant-wrong', true);
  await page.getByRole('combobox', { name: 'ระดับความช่วยเหลือ' }).selectOption({ label: 'อธิบายละเอียด' });
  await page.getByRole('button', { name: 'ส่งไป api.anthropic.com' }).click();
  await expect(page.getByTestId('tutor-answer')).toHaveText(
    'คีย์ API ใช้ไม่ได้หรือไม่มีสิทธิ์ ตรวจคีย์ของ Anthropic (Claude) อีกครั้ง (invalid x-api-key)',
  );
  expect(headers['x-api-key']).toBe('sk-ant-wrong');
  expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(JSON.parse(aiRequests[0]!.postData() ?? '{}').system).toContain('อธิบายแนวคิด');

  // จำคีย์ไว้ในเครื่อง แต่ไม่อยู่ในไฟล์บันทึกของเกม
  expect(await page.evaluate(() => localStorage.getItem('zncpu.tutor.key.anthropic'))).toBe('sk-ant-wrong');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => localStorage.getItem('zncpu.save.v1') ?? '')).not.toContain('sk-ant');

  await tutor(page).getByRole('button', { name: 'ตั้งค่า' }).click();
  await page.getByRole('button', { name: 'ปิดติวเตอร์และลบคีย์' }).click();
  await expect(tutor(page)).toContainText('(ปิดอยู่)');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('zncpu.tutor.key')))).toEqual([]);
});

test('OpenAI ในด่านเขียนโปรแกรม: ส่งโปรแกรมพร้อมเลขบรรทัดและ error ของ assembler', async ({ page }) => {
  let body = '';
  await page.route('https://api.openai.com/**', async (route) => {
    body = route.request().postData() ?? '';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'คำสั่ง ADD สะกดผิดที่บรรทัด 2' }] }] }),
    });
  });
  await openWithSave(page, before('prog.hello'));
  await levelNamed(page, /แสดงเลข 42/).click();
  await page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' }).fill('MOV A, 42\nADDD A, 1\nHALT');
  await openTutor(page);
  await setup(page, 'OpenAI', 'sk-openai-test');
  await page.getByRole('button', { name: 'ส่งไป api.openai.com' }).click();
  await expect(page.getByTestId('tutor-answer')).toContainText('คำสั่ง ADD สะกดผิดที่บรรทัด 2');
  const sent = JSON.parse(body) as { model: string; input: string; store: boolean };
  expect(sent.model).toBe('gpt-6-luna');
  expect(sent.store).toBe(false);
  expect(sent.input).toContain('  2| ADDD A, 1');
  expect(sent.input).toContain('assembler: บรรทัด 2');
  expect(sent.input).toContain('กรณีทดสอบ:');
});

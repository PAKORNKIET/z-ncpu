// M5-3: CPU ที่ผู้เล่นออกแบบเองผ่านไฟล์นิยาม ISA
// ด่านโบนัส (เพิ่ม SHR ให้ CPU Z8+), ISA ของฉันในสนามทดลอง, และหน้าคอมพิวเตอร์ที่เลือก CPU Z8+ แล้วเทียบกับ emulator
import { expect, test, type Page } from '@playwright/test';
import { before, levelNamed, openWithSave, ORDER, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

const INC_ISA = {
  format: 'zncpu-isa',
  version: 1,
  base: 'Z8',
  name: 'Z8+',
  instructions: [
    { mnemonic: 'SHR', func: 0, operands: ['rd'], semantics: 'rd = rd >> 1' },
    { mnemonic: 'INC', func: 1, operands: ['rd'], semantics: 'rd = rd + 1' },
  ],
};

test.describe('ด่านโบนัส: เพิ่มคำสั่ง SHR', () => {
  test('เริ่มจากสำเนาของ CPU บทที่ 7 ซึ่งยังไม่รู้จัก SHR จึงไม่ผ่านที่คำสั่ง SHR', async ({ page }) => {
    test.setTimeout(120_000);
    await openWithSave(page, before('adv.shr'));
    await levelNamed(page, /เพิ่มคำสั่ง SHR/).click();
    await expect(page.locator('.lesson')).toContainText('กลุ่มคำสั่ง 11');
    // คัดลอก CPU มาให้แล้ว: NAND เท่ากับ CPU เดิม
    await expect(page.getByTestId('nand-count')).toHaveText('55189', { timeout: 30_000 });
    const program = page.getByRole('region', { name: 'แผงโปรแกรม' });
    await expect(program).toContainText('SHR A');
    await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
    await expect(page.getByTestId('cpu-failure')).toContainText('หลังทำคำสั่ง SHR A', { timeout: 90_000 });
    await expect(page.getByTestId('cpu-failure').getByRole('table', { name: 'ขาที่ได้ค่าผิด' })).toContainText('75 · 0x4B');
  });

  test('CPU ที่ต่อ SHR แล้วผ่านทุกโปรแกรม รวมโปรแกรมเดิมของบทที่ 7', async ({ page }) => {
    test.setTimeout(150_000);
    await openWithSave(page, before('adv.shr'), ['adv.shr']);
    await levelNamed(page, /เพิ่มคำสั่ง SHR/).click();
    await expect(page.getByTestId('nand-count')).toHaveText('55209', { timeout: 30_000 });
    await page.getByRole('button', { name: 'ทดสอบ', exact: true }).click();
    await expect(page.locator('.test-result')).toContainText('ผ่านด่านแล้ว', { timeout: 120_000 });
    await expect(page.getByRole('list', { name: 'โปรแกรมทดสอบ' }).locator('li.ok')).toHaveCount(4);
  });
});

async function openSandbox(page: Page, extra: Record<string, unknown> = {}) {
  await openWithSave(page, [], [], extra);
  await page.getByRole('tab', { name: /สนามทดลอง/ }).click();
  await expect(page.getByRole('heading', { name: /ISA ของฉัน/ })).toBeVisible();
}

test.describe('ISA ของฉัน (สนามทดลอง)', () => {
  test('เริ่มต้นมี SHR · เพิ่มคำสั่งใหม่ สูตรผิดบอกเหตุผล แก้แล้วพร้อมใช้ และยังอยู่หลังรีโหลด', async ({ page }) => {
    await openSandbox(page);
    const list = page.getByRole('list', { name: 'คำสั่งที่เพิ่มเอง' });
    await expect(page.getByRole('textbox', { name: 'ชื่อของSHR' })).toHaveValue('SHR');
    await expect(page.getByTestId('isa-status')).toContainText('พร้อมใช้ 1 คำสั่ง');

    await page.getByRole('button', { name: 'เพิ่มคำสั่ง' }).click();
    await page.getByRole('textbox', { name: 'ชื่อของคำสั่งที่ 2' }).fill('jnc');
    // พิมพ์ตัวเล็กได้ แต่เก็บเป็นตัวใหญ่
    await expect(page.getByRole('textbox', { name: 'ชื่อของJNC' })).toHaveValue('JNC');
    await expect(page.getByRole('combobox', { name: 'func ของ JNC' })).toHaveValue('1');
    await page.getByRole('combobox', { name: 'ตัวถูกดำเนินการของ JNC' }).selectOption('src');
    const sem = page.getByRole('textbox', { name: 'สูตรของ JNC' });
    await sem.fill('PC = CF ? PC + 1 : src)');
    await expect(list.getByRole('list', { name: 'ข้อผิดพลาดของ JNC' })).toContainText('เกินมา');
    await expect(page.getByTestId('isa-status')).toContainText('ใช้ได้ 1 จาก 2 คำสั่ง');
    await sem.fill('PC = CF ? PC + 1 : src');
    await expect(page.getByTestId('isa-status')).toContainText('พร้อมใช้ 2 คำสั่ง');

    // ชื่อชนกับคำสั่งเดิมของ Z8
    await page.getByRole('button', { name: 'เพิ่มคำสั่ง' }).click();
    await page.getByRole('textbox', { name: 'ชื่อของคำสั่งที่ 3' }).fill('ADD');
    await expect(list.getByRole('list', { name: 'ข้อผิดพลาดของ ADD' })).toContainText('มีอยู่แล้วใน Z8');
    await page.getByRole('button', { name: 'ลบADD' }).click();

    await page.waitForTimeout(600);
    await page.reload();
    await page.getByRole('tab', { name: /สนามทดลอง/ }).click();
    await expect(page.getByRole('textbox', { name: 'สูตรของ JNC' })).toHaveValue('PC = CF ? PC + 1 : src');
    await expect(page.getByTestId('isa-status')).toContainText('พร้อมใช้ 2 คำสั่ง');
  });

  test('ส่งออกเป็นไฟล์ .isa.json แล้วเปิดกลับได้ ไฟล์แปลกปลอมเปิดไม่ได้', async ({ page }) => {
    await openSandbox(page, { isa: INC_ISA });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ส่งออก' }).click()]);
    expect(download.suggestedFilename()).toBe('Z8+.isa.json');
    const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
    expect(JSON.parse(text)).toEqual(INC_ISA);

    await page.getByTestId('open-isa').setInputFiles({ name: 'bad.isa.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"zncpu-isa","version":1,"base":"x86"}') });
    await expect(page.getByTestId('isa-status')).toContainText('เปิดไฟล์ไม่ได้: ไฟล์ ISA ต้องต่อยอดจาก Z8');

    const mine = { ...INC_ISA, name: 'ของเพื่อน', instructions: [{ mnemonic: 'CLR', func: 2, operands: [], semantics: 'A = 0; B = 0' }] };
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('open-isa').setInputFiles({ name: 'friend.isa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(mine)) });
    await expect(page.getByTestId('isa-status')).toContainText('เปิดไฟล์แล้ว: 1 คำสั่ง');
    await expect(page.getByRole('textbox', { name: 'สูตรของ CLR' })).toHaveValue('A = 0; B = 0');
  });
});

async function openPlus(page: Page, extra: Record<string, unknown>) {
  await openWithSave(page, ORDER, [], extra);
  await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
  await expect(page.getByTestId('cpu-gates')).toHaveText('55,189', { timeout: 30_000 });
  await page.getByRole('combobox', { name: 'เลือก CPU' }).selectOption({ label: 'Z8+ (ISA ของฉัน)' });
  await expect(page.getByTestId('cpu-gates')).toHaveText('55,209', { timeout: 30_000 });
}

test.describe('หน้าคอมพิวเตอร์: CPU Z8+', () => {
  test('เขียนโปรแกรมด้วย SHR รันบน CPU Z8+ และเทียบกับ emulator ได้ตรงทุก cycle', async ({ page }) => {
    test.setTimeout(120_000);
    await openPlus(page, { isa: INC_ISA });
    await expect(page.getByTestId('isa-info')).toContainText('Z8 + SHR, INC');
    const editor = page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' });
    await editor.fill('MOV A, 200\nloop: SHR A\nSTORE [OUT], A\nCMP A, 0\nJNZ loop\nHALT');
    await page.getByRole('button', { name: 'โหลดลง CPU แล้ว reset' }).click();
    await expect(page.getByRole('table', { name: 'คำสั่งในแผงโปรแกรม' })).toContainText('SHR A');
    await page.getByRole('button', { name: 'ทีละคำสั่ง' }).click();
    await expect(page.getByTestId('explain')).toContainText('SHR A: rd = rd >> 1 → A = 100');
    await page.getByRole('combobox', { name: 'ความเร็ว' }).selectOption({ label: 'เร็วที่สุด' });
    await page.getByRole('button', { name: 'รัน', exact: true }).click();
    await expect(page.getByTestId('run-state')).toContainText('หยุดที่ HALT', { timeout: 20_000 });
    await expect(page.getByRole('status', { name: /^จอ \(0xF0\) = / })).toHaveAttribute('aria-label', 'จอ (0xF0) = 0');

    await page.getByRole('button', { name: 'เทียบกับ emulator' }).click();
    await expect(page.getByTestId('verify-result')).toContainText('ตรงกับ emulator ทุก cycle', { timeout: 60_000 });

    // CPU Z8 เดิมไม่รู้จัก SHR: assembler บอกทันที
    await page.getByRole('combobox', { name: 'เลือก CPU' }).selectOption({ label: 'Z8 (บทที่ 7)' });
    await expect(page.getByRole('list', { name: 'ข้อผิดพลาดของโปรแกรม' })).toContainText('ไม่รู้จักคำสั่ง "SHR"');
  });

  test('คำสั่งที่เพิ่มใน ISA แต่ยังไม่ได้ต่อวงจร: เทียบแล้วบอก cycle คำสั่ง และ register ที่ต่างกัน', async ({ page }) => {
    test.setTimeout(120_000);
    await openPlus(page, { isa: INC_ISA });
    await page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' }).fill('MOV A, 5\nINC A\nSTORE [OUT], A\nHALT');
    await page.getByRole('button', { name: 'เทียบกับ emulator' }).click();
    const result = page.getByTestId('verify-result');
    await expect(result).toContainText('ไม่ตรงที่ cycle 2 หลังคำสั่ง INC A ที่ 0x01', { timeout: 60_000 });
    await expect(result).toContainText('A: CPU ได้ 5 (0x05) แต่ emulator ได้ 6 (0x06)');
    // แก้โปรแกรมแล้วผลเดิมไม่ใช่ของโปรแกรมนี้
    await page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' }).fill('MOV A, 5\nHALT');
    await expect(result).toContainText('กดเทียบอีกครั้ง');
  });
});

// ใช้ได้ทุกอุปกรณ์ (มือถือ แท็บเล็ต คอม): หน้าไม่ล้นจอ ปุ่มใหญ่พอ ช่องกรอกไม่ทำให้ iPhone ซูม และจัดหน้าตามขนาดจอ
import { expect, test, type Page } from '@playwright/test';
import { before, canvas, levelNamed, openWithSave, ORDER, watchErrors } from './helpers';

let check: () => void;
test.beforeEach(({ page }) => {
  check = watchErrors(page);
});
test.afterEach(() => check());

type Issues = { overflow: number; tiny: string[]; zoom: string[] };

/**
 * ตรวจหน้าตอนนี้: ล้นจอแนวนอน, ปุ่มหรือช่องที่เล็กกว่า 24px (WCAG 2.5.8)
 * และบนจอสัมผัส ช่องกรอกที่ตัวหนังสือเล็กกว่า 16px (iPhone/iPad จะซูมหน้าเองตอนแตะ)
 */
async function issues(page: Page): Promise<Issues> {
  return page.evaluate(() => {
    const name = (el: Element): string =>
      `${el.tagName.toLowerCase()}.${String(el.className)} [${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}]`;
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const tiny: string[] = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary')) {
      if (!shown(el)) continue;
      // ลิงก์ในประโยคได้รับการยกเว้น และ checkbox ที่มีข้อความครอบ กดที่ข้อความได้
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
      const type = (el as HTMLInputElement).type;
      if (el.tagName === 'INPUT' && (type === 'checkbox' || type === 'radio') && el.closest('label')) continue;
      const r = el.getBoundingClientRect();
      if (Math.min(r.width, r.height) < 24) tiny.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const zoom = matchMedia('(pointer: coarse)').matches
      ? [...document.querySelectorAll('input, select, textarea')]
          .filter((el) => shown(el) && !['checkbox', 'radio', 'range', 'file', 'hidden'].includes((el as HTMLInputElement).type))
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
          .map((el) => `${name(el)} ${getComputedStyle(el).fontSize}`)
      : [];
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, tiny, zoom };
  });
}

async function expectClean(page: Page, where: string): Promise<void> {
  const r = await issues(page);
  expect(r.overflow, `${where}: หน้าล้นจอแนวนอน`).toBeLessThanOrEqual(1);
  expect(r.tiny, `${where}: ปุ่มเล็กกว่า 24px`).toEqual([]);
  expect(r.zoom, `${where}: ช่องกรอกเล็กกว่า 16px บนจอสัมผัส`).toEqual([]);
}

/** กรอบของขาเข้าแบบบัสทุกอันอยู่ในแผงข้าง (ไม่ล้นออกนอกกล่อง) */
async function busInsidePanel(page: Page): Promise<void> {
  const out = await page.evaluate(() =>
    [...document.querySelectorAll('.inspector .bus-input')].flatMap((el) => {
      const panel = el.closest('.inspector')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.right > panel.right + 0.5 || r.left < panel.left - 0.5 ? [`${el.querySelector('legend')?.textContent}: ${Math.round(r.left)}..${Math.round(r.right)} นอก ${Math.round(panel.left)}..${Math.round(panel.right)}`] : [];
    }),
  );
  expect(out, 'ขาเข้าแบบบัสล้นแผงข้าง').toEqual([]);
}

async function openLevel(page: Page, title: RegExp): Promise<void> {
  const toggle = page.locator('.levels-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await levelNamed(page, title).click();
}

test.describe('มือถือ (จอสัมผัส)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('ทุกหน้าไม่ล้นจอ ปุ่มไม่เล็กเกิน และช่องกรอกไม่ทำให้ซูม', async ({ page }) => {
    await openWithSave(page, before('arith.add4'));
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await expectClean(page, 'หน้าด่าน');
    // iPhone/iPad/Android ไม่รู้จักนามสกุล .zncpu ถ้ากรองไว้ไฟล์จะเลือกไม่ได้
    await expect(page.getByTestId('open-file')).not.toHaveAttribute('accept');

    // ติวเตอร์: ช่องเลือกผู้ให้บริการ ชื่อโมเดล คีย์ และลิงก์ขอคีย์
    await page.locator('details.tutor > summary').click();
    await page.getByRole('button', { name: 'ตั้งค่าและเปิดใช้' }).click();
    await expect(page.getByLabel('คีย์ API', { exact: true })).toBeVisible();
    await expectClean(page, 'ตั้งค่าติวเตอร์');

    // ดูเฉลย: ปุ่มปิดใหญ่พอให้นิ้วกด
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'ดูเฉลย' }).click();
    const close = page.getByRole('button', { name: 'ปิดเฉลย' });
    await expect(page.getByTestId('solution-text')).toBeVisible();
    const box = (await close.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40);
    await expectClean(page, 'หน้าต่างเฉลย');
    await close.click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('tab', { name: /สนามทดลอง/ }).click();
    await expect(page.getByRole('heading', { name: /ISA ของฉัน/ })).toBeVisible();
    await expectClean(page, 'สนามทดลอง');

    await page.getByRole('tab', { name: /เกี่ยวกับ/ }).click();
    await expect(page.getByTestId('about-version')).toBeVisible();
    await expectClean(page, 'เกี่ยวกับ');
  });

  test('ด่านเขียนโปรแกรม: ช่องเขียน 16px และเลขบรรทัดตรงกับบรรทัดที่พิมพ์', async ({ page }) => {
    await openWithSave(page, before('prog.max'));
    await openLevel(page, /ค่าที่มากกว่า/);
    const editor = page.getByRole('textbox', { name: 'ซอร์สโค้ด assembly' });
    await expect(editor).toBeVisible();
    await expectClean(page, 'ด่านเขียนโปรแกรม');
    const m = await page.evaluate(() => {
      const ta = getComputedStyle(document.querySelector('.asm-editor textarea')!);
      const line = getComputedStyle(document.querySelector('.asm-gutter div')!);
      return { size: ta.fontSize, taLine: ta.lineHeight, gutterLine: line.lineHeight };
    });
    expect(m.size).toBe('16px');
    expect(m.gutterLine).toBe(m.taLine);
  });

  test('คีย์บอร์ดของคอมพิวเตอร์ใช้แป้นพิมพ์บนจอได้ (keydown ไม่บอกปุ่ม)', async ({ page }) => {
    await openWithSave(page, ORDER);
    await page.getByRole('tab', { name: /คอมพิวเตอร์/ }).click();
    const key = page.getByLabel('คีย์บอร์ด: คลิกแล้วกดปุ่ม');
    await expect(key).toBeVisible();
    // ช่องต้องไม่ใช่ readOnly ไม่งั้นแป้นพิมพ์บนจอจะไม่ขึ้น
    await expect(key).toBeEditable();
    await key.focus();
    // แป้นพิมพ์บนจอ Android: keydown เป็น "Unidentified" แล้วส่งตัวอักษรมากับ input
    await key.evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Unidentified', bubbles: true, cancelable: true }));
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'z', bubbles: true }));
    });
    await expect(key).toHaveValue("'z' = 122");
    await key.evaluate((el) => el.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', data: null, bubbles: true })));
    await expect(key).toHaveValue('= 8');
    // คีย์บอร์ดจริงยังใช้ได้เหมือนเดิม
    await page.keyboard.press('A');
    await expect(key).toHaveValue("'A' = 65");
  });
});

test.describe('มือถือแนวนอน', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('พื้นที่วาดไม่สูงเต็มจอ ยังเหลือที่ให้นิ้วเลื่อนหน้า', async ({ page }) => {
    await openWithSave(page, before('logic.and'));
    const h = (await canvas(page).boundingBox())!.height;
    expect(h).toBeLessThanOrEqual(390 * 0.75);
    await expectClean(page, 'หน้าด่านแนวนอน');
  });
});

test.describe('iPad แนวนอน (จอสัมผัส 1180px)', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

  test('รายการด่านพับไว้ พื้นที่วาดกว้าง และบัสไม่ล้นแผงข้าง', async ({ page }) => {
    await openWithSave(page, before('alu.alu8'), ['alu.alu8']);
    await expect(page.locator('.levels-toggle')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'ด่าน' })).toBeHidden();
    await openLevel(page, /ALU 8 บิต/);
    await expect(page.getByTestId('nand-count')).not.toHaveText('0');
    expect((await canvas(page).boundingBox())!.width).toBeGreaterThanOrEqual(600);
    await busInsidePanel(page);
    await expectClean(page, 'ด่าน ALU บน iPad');
  });
});

test.describe('คอม', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('รายการด่านอยู่ข้างจอ บัส 16 บิตแบ่งเป็นสองแถว และไม่ล้นแผงข้าง', async ({ page }) => {
    await openWithSave(page, before('mem.mux16'));
    await expect(page.getByTestId('open-file')).toHaveAttribute('accept', '.zncpu,application/json');
    await expect(page.getByRole('navigation', { name: 'ด่าน' })).toBeVisible();
    await expect(page.locator('.levels-toggle')).toBeHidden();
    await levelNamed(page, /MUX 16 บิต/).click();
    const bit = (i: number) => page.getByRole('button', { name: `a บิต ${i}`, exact: true }).boundingBox();
    const [b15, b8, b7] = [await bit(15), await bit(8), await bit(7)];
    // แถวบนคือไบต์บน (บิต 15-8) แถวล่างคือไบต์ล่าง (บิต 7-0)
    expect(b8!.y).toBe(b15!.y);
    expect(b7!.y).toBeGreaterThan(b15!.y);
    expect(b7!.x).toBe(b15!.x);
    await busInsidePanel(page);
    await expectClean(page, 'ด่าน MUX 16 บิต');
  });

  test('หน้าต่างเล็ก (1024x700): ด่าน ALU ไม่ล้นจอ และบัสไม่ล้นแผงข้าง', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 700 });
    await openWithSave(page, before('alu.alu8'), ['alu.alu8']);
    await openLevel(page, /ALU 8 บิต/);
    await expect(page.getByTestId('nand-count')).not.toHaveText('0');
    await busInsidePanel(page);
    await expectClean(page, 'ด่าน ALU หน้าต่างเล็ก');
  });
});

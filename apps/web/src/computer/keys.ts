// คีย์บอร์ดของคอมพิวเตอร์ (อุปกรณ์ 0xFA): แปลงปุ่มที่กดเป็นรหัสที่ CPU อ่าน
// ใช้ได้ทั้งคีย์บอร์ดจริง (keydown) และแป้นพิมพ์บนจอมือถือ/แท็บเล็ต (input)

const SPECIAL: Record<string, number> = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27, ArrowLeft: 17, ArrowUp: 18, ArrowRight: 19, ArrowDown: 20 };

/** รหัสของปุ่มคีย์บอร์ด: ตัวอักษรใช้ ASCII ปุ่มพิเศษบางปุ่มใช้รหัสมาตรฐาน ปุ่มที่ไม่รู้จัก (เช่น "Unidentified") ได้ undefined */
export function keyCode(e: { key: string }): number | undefined {
  if ([...e.key].length === 1) {
    const c = e.key.codePointAt(0)!;
    return c < 256 ? c : undefined;
  }
  return SPECIAL[e.key];
}

/**
 * รหัสจากการพิมพ์ผ่านแป้นพิมพ์บนจอ (เหตุการณ์ input): ตัวสุดท้ายที่พิมพ์ หรือลบ/ขึ้นบรรทัดใหม่
 * แป้นพิมพ์บนจอ Android ส่ง keydown เป็น "Unidentified" จึงต้องอ่านจากตรงนี้แทน
 */
export function typedKey(e: { data?: string | null; inputType?: string }): number | undefined {
  if (e.inputType === 'deleteContentBackward') return 8;
  if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') return 13;
  const ch = e.data ? [...e.data].pop() : undefined;
  return ch === undefined ? undefined : keyCode({ key: ch });
}

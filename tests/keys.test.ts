// คีย์บอร์ดของคอมพิวเตอร์ (0xFA): ใช้ได้ทั้งคีย์บอร์ดจริงและแป้นพิมพ์บนจอมือถือ/แท็บเล็ต
import { describe, expect, it } from 'vitest';
import { keyCode, typedKey } from '../apps/web/src/computer/keys';

describe('keyCode (keydown จากคีย์บอร์ดจริง)', () => {
  it('ตัวอักษรได้รหัส ASCII', () => {
    expect(keyCode({ key: 'a' })).toBe(97);
    expect(keyCode({ key: 'A' })).toBe(65);
    expect(keyCode({ key: '7' })).toBe(55);
    expect(keyCode({ key: ' ' })).toBe(32);
  });

  it('ปุ่มพิเศษได้รหัสมาตรฐาน', () => {
    expect(keyCode({ key: 'Enter' })).toBe(13);
    expect(keyCode({ key: 'Backspace' })).toBe(8);
    expect(keyCode({ key: 'ArrowUp' })).toBe(18);
  });

  it('ปุ่มที่ไม่รู้จักและตัวอักษรนอก 0-255 ได้ undefined', () => {
    // แป้นพิมพ์บนจอ Android ส่ง key = "Unidentified" ต้องไปอ่านจาก input แทน
    expect(keyCode({ key: 'Unidentified' })).toBeUndefined();
    expect(keyCode({ key: 'Shift' })).toBeUndefined();
    expect(keyCode({ key: 'ก' })).toBeUndefined();
    expect(keyCode({ key: '😀' })).toBeUndefined();
  });
});

describe('typedKey (input จากแป้นพิมพ์บนจอ)', () => {
  it('ตัวที่พิมพ์ (รวมตอนแป้นพิมพ์กำลังเดาคำ ใช้ตัวสุดท้าย)', () => {
    expect(typedKey({ inputType: 'insertText', data: 'x' })).toBe(120);
    expect(typedKey({ inputType: 'insertCompositionText', data: 'he' })).toBe(101);
  });

  it('ลบและขึ้นบรรทัดใหม่', () => {
    expect(typedKey({ inputType: 'deleteContentBackward', data: null })).toBe(8);
    expect(typedKey({ inputType: 'insertLineBreak', data: null })).toBe(13);
  });

  it('ไม่มีตัวอักษรหรือเป็นตัวที่ CPU อ่านไม่ได้: ไม่เปลี่ยนค่า', () => {
    expect(typedKey({ inputType: 'insertText', data: null })).toBeUndefined();
    expect(typedKey({ inputType: 'insertText', data: 'ก' })).toBeUndefined();
    expect(typedKey({ inputType: 'deleteByCut', data: null })).toBeUndefined();
  });
});

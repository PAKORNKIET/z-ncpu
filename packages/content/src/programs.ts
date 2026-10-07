// โปรแกรมตัวอย่างของหน้าคอมพิวเตอร์ (assembly ของ Z8) เป็นข้อความล้วน assemble ตอนใช้
import type { LocalizedText } from '@z-ncpu/shared';

export interface ExampleProgram {
  id: string;
  name: LocalizedText;
  /** ความเร็วที่ดูสวย (Hz) */
  hz: number;
  source: string;
}

export const EXAMPLE_PROGRAMS: ExampleProgram[] = [
  {
    id: 'count',
    name: { th: 'นับ 0 ถึง 9 บนจอ', en: 'Count 0 to 9' },
    hz: 10,
    source: `; นับ 0 ถึง 9 แล้วแสดงบนจอ (Spec ส่วน 10)
        MOV A, 0
loop:   STORE [OUT], A   ; เขียนที่ 0xF0 = จอตัวเลข
        ADD A, 1
        CMP A, 10
        JNZ loop         ; ยังไม่ถึง 10 วนต่อ
        HALT
`,
  },
  {
    id: 'seg-loop',
    name: { th: 'นับ 0–F บน 7-segment วนไม่หยุด', en: 'Count 0–F on the 7-segment forever' },
    hz: 20,
    source: `; 7-segment แสดงเลขฐานสิบหกของ 4 บิตล่าง
        MOV A, 0
loop:   STORE [SEG], A
        STORE [OUT], A
        ADD A, 1
        AND A, 0x0F      ; วนกลับที่ 0 หลัง F
        JMP loop
`,
  },
  {
    id: 'chaser',
    name: { th: 'ไฟวิ่ง LED', en: 'LED chaser' },
    hz: 20,
    source: `; ไฟดวงเดียววิ่งจากขวาไปซ้าย
start:  MOV A, 1
loop:   STORE [LEDS], A
        ADD A, A         ; เลื่อนไปทางซ้าย 1 บิต
        JNZ loop         ; ถ้าเลยดวงซ้ายสุด A = 0
        JMP start
`,
  },
  {
    id: 'switches',
    name: { th: 'สวิตช์ → LED และจอ', en: 'Switches → LEDs and display' },
    hz: 50,
    source: `; อ่านสวิตช์ 8 ตัวแล้วแสดงบน LED และจอ (ลองกดสวิตช์ตอนรัน)
loop:   LOAD A, [SW]
        STORE [LEDS], A
        STORE [OUT], A
        JMP loop
`,
  },
  {
    id: 'keyboard',
    name: { th: 'คีย์บอร์ด → จอ', en: 'Keyboard → display' },
    hz: 50,
    source: `; แสดงรหัส ASCII ของปุ่มล่าสุด และเลขฐานสิบหกหลักท้ายบน 7-segment
loop:   LOAD A, [KEY]
        STORE [OUT], A
        STORE [SEG], A
        LOAD B, [BTN]    ; ปุ่มกด 0–3 ไปที่ LED
        STORE [LEDS], B
        JMP loop
`,
  },
  {
    id: 'fib',
    name: { th: 'Fibonacci', en: 'Fibonacci' },
    hz: 10,
    source: `; ลำดับ Fibonacci ที่ไม่เกิน 255
        MOV A, 0
        MOV B, 1
next:   STORE [OUT], A
        MOV C, A
        ADD C, B
        JC done          ; เกิน 255 แล้ว
        MOV A, B
        MOV B, C
        JMP next
done:   STORE [OUT], B
        HALT
`,
  },
  {
    id: 'multiply',
    name: { th: 'คูณด้วยการบวกซ้ำ (CALL/RET)', en: 'Multiply by repeated addition' },
    hz: 50,
    source: `; 13 × 11 ด้วยฟังก์ชัน mul (ผลใน A) แล้วแสดงบนจอ
        MOV A, 13
        MOV B, 11
        CALL mul
        STORE [OUT], A
        HALT

; A = A × B  (ใช้ C และ D, เก็บค่าเดิมไว้บน stack)
mul:    PUSH C
        PUSH D
        MOV C, A
        MOV A, 0
        MOV D, B
        CMP D, 0
        JZ mul_end
mul_lp: ADD A, C
        SUB D, 1
        JNZ mul_lp
mul_end: POP D
        POP C
        RET
`,
  },
];

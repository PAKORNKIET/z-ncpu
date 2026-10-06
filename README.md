# Z-NCPU (Zero-NandCPU)

สร้าง CPU จากเกต NAND — เว็บและแอป Windows ที่ให้ผู้เรียนไทยต่อคอมพิวเตอร์ขึ้นมาเองทีละด่าน
ตั้งแต่เกต NAND ไปจนถึง CPU ที่รันโปรแกรมที่ตัวเองเขียนได้จริง

เอกสารออกแบบ: **Z-NCPU — Architecture Spec v3** (ส่วนที่อ้างในโค้ด เช่น "Spec ส่วน 6" หมายถึงเอกสารนี้)

## สถานะ: M0 · โครง

| ส่วน | สถานะ |
| --- | --- |
| Data model (pin มีความกว้าง, bus, splitter/merger) | ✅ |
| Flatten → netlist ระดับบิต + diagnostics ไทย/อังกฤษ | ✅ |
| Visual Mode (event-driven, unit delay, trace ไฟวิ่ง) | ✅ |
| Fast Mode (SCC + topological order, loop วนจนนิ่ง) | ✅ |
| ตรวจ oscillation แทนการห้าม loop | ✅ |
| Truth table + test script ตามลำดับเวลา | ✅ |
| Content hash + หาชิ้นที่ต้องทดสอบใหม่ | ✅ |
| ROM ที่ผู้เล่นต่อเองจาก MUX + แผงค่าคงที่ (ROM256 = 16,320 NAND) | ✅ |
| มัดสาย (bundle) สูงสุด 4,096 บิต + แบ่ง bus เป็นส่วน | ✅ |
| Z8 ISA (ไฟล์นิยาม + encode/decode) | ✅ assembler เต็มมาใน M3 |
| Level CI (เฉลยทุกด่านต้องผ่าน) | ✅ ด่าน NOT, AND |
| Web: engine ใน Web Worker + หน้าทดสอบ | ✅ editor จริงมาใน M1 |
| E2E ด้วย Playwright (dev + build) ใน CI | ✅ |
| Windows (Tauri 2) | ⚠️ มี config แล้ว ยังไม่ได้ build บน Windows |

ผลวัดล่าสุด: วงจร 26,000 NAND (ขนาดใกล้ RAM256) compile ~180 ms และรันใน Fast Mode ได้ ~570 tick/วินาที
และ ROM256 ที่ต่อจาก NAND 16,320 ตัวอ่านถูกครบ 256 คำทั้ง Visual Mode และ Fast Mode

## เริ่มใช้งาน

ต้องมี Node.js 20+ และ pnpm 10

```bash
pnpm install
pnpm dev          # เปิดเว็บที่ http://localhost:5173
pnpm test         # เทสต์ทั้งหมด
pnpm check        # typecheck + lint + test (ชุดเดียวกับ CI)
pnpm build        # build เว็บไปที่ apps/web/dist
```

### E2E (Playwright)

เปิดเว็บจริงใน Chromium แล้วกดสวิตช์และตัวนับ ทดสอบทั้งตอน dev (React StrictMode) และตัว build ใช้ port 5174 กับ 4174 จึงรันพร้อม `pnpm dev` ได้

```bash
pnpm e2e:install  # ครั้งแรกครั้งเดียว: ดาวน์โหลด Chromium สำหรับทดสอบ
pnpm e2e          # build แล้วรัน E2E
```

### แอป Windows

ต้องติดตั้ง [Rust](https://rustup.rs) และ prerequisites ของ Tauri 2 (Microsoft C++ Build Tools + WebView2 ซึ่ง Windows 10/11 มีอยู่แล้ว)

```bash
pnpm desktop:dev    # เปิดแอปแบบ dev
pnpm desktop:build  # สร้างตัวติดตั้ง .exe (NSIS) และ .msi
```

ตัวติดตั้งยังไม่มี code signing (ไม่มีค่าใช้จ่าย) Windows SmartScreen จึงจะเตือนตอนติดตั้งครั้งแรก

## โครงสร้าง

```text
apps/
  web/        Vite + React (build เดียวใช้ทั้งเว็บและ Windows)
  desktop/    Tauri 2 ห่อ build ของ web
packages/
  shared/     types กลาง + protocol Worker ↔ UI
  engine/     circuit model, flatten, simulator, validator (TS ล้วน ไม่มี UI)
  isa/        ไฟล์นิยาม ISA + encode/decode
  canvas/     interface ของ renderer และสไตล์สาย (M1)
  content/    ด่าน บทเรียน คำใบ้ glossary และเฉลยสำหรับ CI
```

กฎ dependency ระหว่าง package (Spec ส่วน 4) บังคับด้วย ESLint และห้าม `eval` / `new Function` ทั้งโปรเจกต์

## ตัวอย่าง engine

```ts
import { circuit, ComponentLibrary, compile, createSimulator, inp, out } from '@z-ncpu/engine';

const b = circuit('user.not', 'NOT', [inp('a'), out('y')]);
const n = b.add('prim.nand');
b.wire('self.a', `${n}.a`).wire('self.a', `${n}.b`).wire(`${n}.y`, 'self.y');

const { netlist } = compile(new ComponentLibrary([b.build()]), 'user.not');
const sim = createSimulator(netlist!, 'fast');
sim.setInput('a', 1);
sim.settle();
sim.read('y'); // 0
```

## ค่าใช้จ่าย

ฟรีทั้งหมด: Cloudflare Pages (เว็บ), GitHub Actions + Releases (CI และแจกแอป), ไลบรารีทุกตัวเป็น license เปิด

## License

[MIT](LICENSE) © 2026 Pakornkiet Puanpanwong

- ไลบรารีที่ติดไปกับแอปมีแค่ React, React DOM และ scheduler (MIT ทั้งหมด) ตอน build ระบบรวมข้อความ license ของทุกตัวไว้ที่ `third-party-licenses.txt` และจะ build ไม่ผ่านถ้ามี dependency ที่ license ยังไม่ได้ตรวจ
- ฟอนต์ Noto Sans Thai และ JetBrains Mono ใช้ SIL Open Font License 1.1 และโหลดจาก Google Fonts

## แรงบันดาลใจ

แนวคิด "สร้างคอมพิวเตอร์จาก NAND" ได้แรงบันดาลใจจาก [nand2tetris](https://www.nand2tetris.org) และ [NandGame](https://nandgame.com)
แต่ด่าน บทเรียน ชื่อชิ้นส่วน ชุดคำสั่ง Z8 และโค้ดทั้งหมดในโปรเจกต์นี้เขียนขึ้นใหม่ ไม่ได้นำเนื้อหา ไฟล์โจทย์ ไฟล์ทดสอบ หรือเฉลยของทั้งสองโปรเจกต์มาใช้
(เนื้อหาของ nand2tetris ใช้ [CC BY-NC-SA 3.0](https://www.nand2tetris.org/license) และผู้สร้างขอไม่ให้เผยแพร่เฉลยบนเว็บ)

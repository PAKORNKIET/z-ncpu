// หน้า "เกี่ยวกับ" (M4-4): โปรเจกต์นี้คืออะไร ใครทำ ทำงานอย่างไร และ license
import { CHAPTERS, LEVELS } from '@z-ncpu/content';
import { Box, Cpu, ExternalLink, FileText, GraduationCap, Info, Lock, Monitor, Scale, Zap } from 'lucide-react';

declare const __APP_VERSION__: string;

const REPO = 'https://github.com/PAKORNKIET/z-ncpu';
const AUTHOR_URL = 'https://github.com/PAKORNKIET';

export function AboutPage() {
  const chapters = Object.keys(CHAPTERS).length;
  return (
    <article className="about" aria-labelledby="about-title">
      <section>
        <h2 id="about-title" className="with-icon">
          <Info size={20} aria-hidden /> เกี่ยวกับ Z-NCPU
        </h2>
        <p className="lead">
          Z-NCPU (Zero-NandCPU) คือเกมสร้างคอมพิวเตอร์ 8 บิตด้วยมือตัวเอง เริ่มจากเกต NAND ตัวเดียว ต่อขึ้นไปเป็นเกตพื้นฐาน วงจรบวกเลข หน่วยความจำ
          จนได้ CPU ทั้งเครื่อง แล้วเขียนโปรแกรม assembly ให้ CPU ที่ต่อเองรันจริง
        </p>
        <p className="small muted" data-testid="about-version">
          เวอร์ชัน {__APP_VERSION__}
        </p>
      </section>

      <section aria-labelledby="about-what">
        <h3 id="about-what">ในเกมมีอะไร</h3>
        <ul className="about-list">
          <li>
            <GraduationCap size={18} aria-hidden />
            <span>
              {chapters} บท {LEVELS.length} ด่าน พร้อมบทเรียนภาษาไทยและคำใบ้ ทุกด่านมีการทดสอบอัตโนมัติ
            </span>
          </li>
          <li>
            <Cpu size={18} aria-hidden />
            <span>CPU Z8 ที่ต่อเสร็จใช้ NAND ราว 55,000 ตัว และรันได้หลายร้อยจังหวะนาฬิกาต่อวินาทีในเบราว์เซอร์</span>
          </li>
          <li>
            <Zap size={18} aria-hidden />
            <span>เครื่องมือดีบัก: ย้อนเวลา (time travel), Logic Analyzer, breakpoint แบบมีเงื่อนไข และ “Why?” ที่ไล่หาว่าค่ามาจากเกตไหน</span>
          </li>
          <li>
            <Box size={18} aria-hidden />
            <span>มุมมอง 3D ซูมจากภาพรวมของ CPU ลงไปจนเห็น NAND ทุกตัว และเห็นไฟวิ่งตอนรันโปรแกรม</span>
          </li>
          <li>
            <Monitor size={18} aria-hidden />
            <span>เล่นได้บนเว็บ ติดตั้งเป็นแอป (PWA) ใช้ออฟไลน์ได้ และมีแอป Windows</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="about-how">
        <h3 id="about-how">ทำงานอย่างไร</h3>
        <p>
          วงจรของผู้เล่นถูกแปลงเป็นรายการ NAND ล้วน แล้วจำลองทีละเกตใน Web Worker ไม่มีการ “โกง” ด้วยโค้ดสำเร็จรูป ค่าทุกค่าบนจอ (รวมถึงค่า register ของ CPU)
          อ่านมาจากเกตที่ผู้เล่นต่อเองจริง
        </p>
        <p className="small muted">React · TypeScript · Canvas 2D · Web Worker · three.js + React Three Fiber · Tauri · Vitest · Playwright</p>
      </section>

      <section aria-labelledby="about-privacy">
        <h3 id="about-privacy" className="with-icon">
          <Lock size={16} aria-hidden /> ความเป็นส่วนตัว
        </h3>
        <p>ไม่ต้องสมัครสมาชิก ไม่มีโฆษณา และไม่เก็บข้อมูลการใช้งาน ความคืบหน้าบันทึกไว้ในเครื่องนี้เท่านั้น ย้ายเครื่องได้ด้วยไฟล์ .zncpu</p>
      </section>

      <section aria-labelledby="about-author">
        <h3 id="about-author">ผู้พัฒนา</h3>
        <p>
          <strong>Pakornkiet Puanpanwong</strong> ·{' '}
          <a href={AUTHOR_URL} target="_blank" rel="noreferrer">
            github.com/PAKORNKIET <ExternalLink size={14} aria-hidden />
          </a>
        </p>
        <p>
          <a href={REPO} target="_blank" rel="noreferrer">
            github.com/PAKORNKIET/z-ncpu <ExternalLink size={14} aria-hidden />
          </a>{' '}
          <span className="small muted">(ซอร์สโค้ด)</span>
        </p>
      </section>

      <section aria-labelledby="about-license">
        <h3 id="about-license" className="with-icon">
          <Scale size={16} aria-hidden /> License
        </h3>
        <p>Z-NCPU เป็นซอฟต์แวร์โอเพนซอร์สภายใต้ MIT License © 2026 Pakornkiet Puanpanwong</p>
        <p>
          <a href="./third-party-licenses.txt" target="_blank" rel="noreferrer">
            <FileText size={14} aria-hidden /> license ของซอฟต์แวร์อื่นที่ใช้ในแอป
          </a>
        </p>
      </section>
    </article>
  );
}

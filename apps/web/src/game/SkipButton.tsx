// ข้ามด่าน: ถามยืนยันก่อนเสมอ แล้วใช้วงจรเฉลยเป็นชิ้นของด่านนี้ ด่านถัดไปจะได้เล่นต่อได้
// ด่านที่ข้ามขึ้นว่า "ข้ามแล้ว" (ไม่นับว่าผ่าน) กลับมาต่อเองแล้วกดทดสอบผ่านเมื่อไรก็เปลี่ยนเป็น "ผ่านแล้ว"
import type { ComponentDef, LevelDef } from '@z-ncpu/shared';
import { SkipForward } from 'lucide-react';
import { useState } from 'react';
import { loadSolution } from './solution';

export function SkipButton({ level, onSkip }: { level: LevelDef; onSkip: (solution: ComponentDef | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const program = level.tests.type === 'program';
  const skip = async (): Promise<void> => {
    const what = program
      ? 'ด่านนี้จะขึ้นว่า "ข้ามแล้ว" และด่านถัดไปจะเปิดให้เล่น โปรแกรมที่เขียนไว้ยังอยู่เหมือนเดิม'
      : 'เกมจะใส่วงจรเฉลยเป็นชิ้นของด่านนี้ให้ใช้ในด่านถัดไป วงจรที่ต่อค้างไว้ในด่านนี้จะถูกแทนด้วยเฉลย';
    if (!window.confirm(`ข้ามด่าน "${level.title.th}"?\n\n${what}\n\nกลับมาทำเองได้ทุกเมื่อ ทดสอบผ่านเมื่อไรจะนับว่าผ่าน`)) return;
    setBusy(true);
    setError(null);
    try {
      if (program) {
        onSkip(null);
        return;
      }
      const s = await loadSolution(level.id);
      if (s?.kind !== 'circuit') throw new Error('ไม่มีเฉลยของด่านนี้');
      onSkip(s.def);
    } catch (e) {
      console.warn('ข้ามด่านไม่ได้', e);
      setError('ข้ามด่านไม่ได้เพราะโหลดเฉลยไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button onClick={() => void skip()} disabled={busy} title="ข้ามไปด่านถัดไป (ถามยืนยันก่อน)">
        <SkipForward size={16} aria-hidden /> {busy ? 'กำลังข้าม…' : 'ข้ามด่าน'}
      </button>
      {error ? (
        <p className="error small" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

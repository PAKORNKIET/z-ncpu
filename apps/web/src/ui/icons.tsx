// ไอคอนที่ใช้ร่วมกันหลายหน้า (lucide, ISC) ไอคอนเป็นแค่ภาพประกอบ ข้อความหรือ aria-label ต้องบอกความหมายเสมอ
import { Check, X } from 'lucide-react';

/** เครื่องหมายถูก/ผิดในตาราง (มีข้อความสำหรับโปรแกรมอ่านหน้าจอ) */
export function OkMark({ ok }: { ok: boolean | undefined }) {
  if (ok === undefined) return null;
  return ok ? <Check size={16} className="mark ok" aria-hidden /> : <X size={16} className="mark fail" aria-hidden />;
}

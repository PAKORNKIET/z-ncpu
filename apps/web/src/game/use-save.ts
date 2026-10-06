// ไฟล์บันทึกของผู้เล่นใน React: โหลดตอนเปิดแอป บันทึกลง localStorage อัตโนมัติ (หน่วงเวลาเล็กน้อย)
import { useEffect, useRef, useState } from 'react';
import { loadSave, storeSave, type KeyValueStore, type SaveFile } from './save';

function storage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useSave() {
  const [initial] = useState(() => loadSave(storage()));
  const [save, setSave] = useState<SaveFile>(initial.save);
  const [warning, setWarning] = useState<string | undefined>(initial.warning);
  const first = useRef(true);
  const latest = useRef(save);
  latest.current = save;

  // ปิดแท็บก่อนครบเวลาหน่วง ก็ยังบันทึกทัน
  useEffect(() => {
    const flush = (): void => void storeSave(storage(), latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (!storeSave(storage(), save)) setWarning('บันทึกลงเครื่องไม่ได้ ลองบันทึกเป็นไฟล์แทน');
    }, 300);
    return () => clearTimeout(t);
  }, [save]);

  return { save, setSave, warning };
}

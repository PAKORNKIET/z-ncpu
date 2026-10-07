// ช่องเขียน assembly: เลขบรรทัด, Tab ใส่ช่องว่าง, และรายการ error ภาษาไทยที่คลิกแล้วกระโดดไปบรรทัดนั้น
// ใช้ทั้งหน้าคอมพิวเตอร์และด่านเขียนโปรแกรม
import { formatDiagnostic, type AsmResult } from '@z-ncpu/isa';
import { useRef, type ReactNode } from 'react';

export function AsmEditor(props: { source: string; onChange: (s: string) => void; asm: AsmResult; status?: ReactNode; height?: number }) {
  const { source, asm } = props;
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = source.split('\n').length;
  const errorLines = new Set(asm.diagnostics.map((d) => d.line));
  const jumpTo = (line: number, col: number): void => {
    const ta = editorRef.current;
    if (!ta) return;
    const at = source.split('\n').slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + col - 1;
    ta.focus();
    ta.setSelectionRange(at, at);
  };
  return (
    <>
      <div className="asm-editor" style={props.height ? { height: props.height } : undefined}>
        <div className="asm-gutter mono" ref={gutterRef} aria-hidden>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className={errorLines.has(i + 1) ? 'err' : undefined}>
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={editorRef}
          className="mono"
          aria-label="ซอร์สโค้ด assembly"
          spellCheck={false}
          value={source}
          onChange={(e) => props.onChange(e.target.value)}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            // Tab ใส่ช่องว่างแทนการย้ายโฟกัส (Esc แล้ว Tab เพื่อออกจากช่อง)
            if (e.key === 'Tab' && !e.shiftKey && !e.altKey) {
              e.preventDefault();
              const t = e.currentTarget;
              const { selectionStart: a, selectionEnd: b } = t;
              const pad = ' '.repeat(8 - ((a - source.lastIndexOf('\n', a - 1) - 1) % 8));
              props.onChange(source.slice(0, a) + pad + source.slice(b));
              requestAnimationFrame(() => t.setSelectionRange(a + pad.length, a + pad.length));
            }
          }}
        />
      </div>
      <div className="asm-status" role="status" aria-live="polite">
        {asm.ok ? (
          <span className="muted small">
            ✓ assemble ผ่าน: {asm.words.length} คำสั่ง จาก 256{props.status}
          </span>
        ) : (
          <ul className="asm-errors" aria-label="ข้อผิดพลาดของโปรแกรม">
            {asm.diagnostics.slice(0, 8).map((d, i) => (
              <li key={i}>
                <button className="linklike" onClick={() => jumpTo(d.line, d.col)}>
                  {formatDiagnostic(d)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

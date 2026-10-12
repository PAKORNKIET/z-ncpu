// ISA ของฉัน (M5-3): เพิ่มคำสั่งเองในกลุ่ม 11 ของ Z8 ด้วยชื่อ func ตัวถูกดำเนินการ และสูตร
// ใช้กับ CPU Z8+ (ด่านโบนัสของบท 9) ที่หน้าคอมพิวเตอร์ ไฟล์ .isa.json เป็นข้อมูลล้วน เปิดจากคนอื่นได้อย่างปลอดภัย
import { checkExtension, CUSTOM_SLOTS, OPERAND_FORMS, parseIsaFile, serializeIsa, Z8_PLUS_DEFAULT, type IsaIssue } from '@z-ncpu/isa';
import type { CustomInstruction, IsaExtension, IsaOperandKind } from '@z-ncpu/shared';
import { AlertTriangle, CheckCircle2, Download, FolderOpen, Plus, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { useRef, useState } from 'react';

const formText = (ops: readonly IsaOperandKind[]): string => (ops.length === 0 ? '(ไม่มี)' : ops.join(', '));
const bits3 = (n: number): string => n.toString(2).padStart(3, '0');

/** func ว่างช่องแรก */
const freeFunc = (ext: IsaExtension): number => {
  const used = new Set(ext.instructions.map((i) => i.func));
  for (let f = 0; f < CUSTOM_SLOTS; f++) if (!used.has(f)) return f;
  return 0;
};

export function IsaEditor({ ext, onChange }: { ext: IsaExtension; onChange: (ext: IsaExtension) => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { issues, compiled } = checkExtension(ext);
  const issuesOf = (i: number): IsaIssue[] => issues.filter((x) => x.index === i);

  const update = (i: number, patch: Partial<CustomInstruction>): void =>
    onChange({ ...ext, instructions: ext.instructions.map((ins, k) => (k === i ? { ...ins, ...patch } : ins)) });
  const remove = (i: number): void => onChange({ ...ext, instructions: ext.instructions.filter((_, k) => k !== i) });
  const add = (): void =>
    onChange({ ...ext, instructions: [...ext.instructions, { mnemonic: '', func: freeFunc(ext), operands: ['rd'], semantics: 'rd = rd' }] });

  const exportFile = (): void => {
    const url = URL.createObjectURL(new Blob([serializeIsa(ext)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(ext.name || 'isa').replace(/[^A-Za-z0-9ก-๙_+-]+/g, '_')}.isa.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (file: File): Promise<void> => {
    const r = parseIsaFile(await file.text());
    if (!r.ok) {
      setNotice(`เปิดไฟล์ไม่ได้: ${r.reason}`);
      return;
    }
    if (ext.instructions.length > 0 && !window.confirm('แทนที่ ISA ของฉันด้วยไฟล์นี้?')) return;
    onChange(r.ext);
    setNotice(`เปิดไฟล์แล้ว: ${r.ext.instructions.length} คำสั่ง`);
  };

  const fileIssues = issuesOf(-1);
  return (
    <section className="isa-editor" aria-labelledby="isa-title">
      <div className="computer-head">
        <h2 id="isa-title" className="with-icon">
          <Wrench size={18} aria-hidden /> ISA ของฉัน (Z8+)
        </h2>
        <div className="isa-actions">
          <button onClick={exportFile} title="บันทึกเป็นไฟล์ .isa.json">
            <Download size={16} aria-hidden /> ส่งออก
          </button>
          <button onClick={() => fileInput.current?.click()} title="เปิดไฟล์ .isa.json">
            <FolderOpen size={16} aria-hidden /> เปิดไฟล์
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="open-isa"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
          <button
            onClick={() => {
              if (window.confirm('คืน ISA เป็นค่าเริ่มต้น (มีแค่ SHR)?')) onChange(Z8_PLUS_DEFAULT);
            }}
            title="คืนค่าเริ่มต้น"
          >
            <RotateCcw size={16} aria-hidden /> ค่าเริ่มต้น
          </button>
        </div>
      </div>
      <p className="small">
        Z8 เว้นกลุ่มคำสั่ง <code>11</code> ไว้ให้เพิ่มคำสั่งเอง {CUSTOM_SLOTS} ช่อง (func 000–111) ตั้งชื่อ เลือกตัวถูกดำเนินการ แล้วเขียน
        <strong>สูตร</strong>ว่าคำสั่งทำอะไร assembler จะรู้จักคำสั่งใหม่ทันที และ emulator ใช้สูตรนี้เป็นคำตอบอ้างอิงตอนตรวจ CPU Z8+ ของคุณ
      </p>
      <p className="muted small">
        ต่อวงจรของคำสั่งใหม่ใน CPU Z8+ ที่ด่านโบนัสของบทที่ 9 แล้วไปหน้า “คอมพิวเตอร์” เลือก CPU Z8+ เขียนโปรแกรม และกด “เทียบกับ emulator”
      </p>

      <ol className="isa-list" aria-label="คำสั่งที่เพิ่มเอง">
        {ext.instructions.map((ins, i) => {
          const mine = issuesOf(i);
          const bad = (f: IsaIssue['field']): boolean => mine.some((x) => x.field === f);
          const label = ins.mnemonic || `คำสั่งที่ ${i + 1}`;
          return (
            <li key={i} className={`isa-item ${mine.length > 0 ? 'has-error' : ''}`}>
              <div className="isa-fields">
                <label>
                  ชื่อคำสั่ง
                  <input
                    className="mono"
                    aria-label={`ชื่อของ${label}`}
                    aria-invalid={bad('mnemonic')}
                    value={ins.mnemonic}
                    maxLength={8}
                    placeholder="เช่น INC"
                    onChange={(e) => update(i, { mnemonic: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                  />
                </label>
                <label>
                  func
                  <select aria-label={`func ของ ${label}`} aria-invalid={bad('func')} value={ins.func} onChange={(e) => update(i, { func: Number(e.target.value) })}>
                    {Array.from({ length: CUSTOM_SLOTS }, (_, f) => (
                      <option key={f} value={f}>
                        {f} ({bits3(f)})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ตัวถูกดำเนินการ
                  <select
                    aria-label={`ตัวถูกดำเนินการของ ${label}`}
                    aria-invalid={bad('operands')}
                    value={formText(ins.operands)}
                    onChange={(e) => update(i, { operands: [...(OPERAND_FORMS.find((f) => formText(f) === e.target.value) ?? [])] })}
                  >
                    {OPERAND_FORMS.map((f) => (
                      <option key={formText(f)} value={formText(f)}>
                        {formText(f)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="linklike" aria-label={`ลบ${label}`} onClick={() => remove(i)}>
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              <label className="isa-sem">
                สูตร
                <input
                  className="mono"
                  aria-label={`สูตรของ ${label}`}
                  aria-invalid={bad('semantics')}
                  value={ins.semantics}
                  maxLength={300}
                  spellCheck={false}
                  placeholder="เช่น rd = rd + 1"
                  onChange={(e) => update(i, { semantics: e.target.value })}
                />
              </label>
              <label className="isa-sem">
                <span>
                  คำอธิบาย <span className="muted">(ไม่บังคับ)</span>
                </span>
                <input aria-label={`คำอธิบายของ ${label}`} value={ins.description ?? ''} maxLength={120} onChange={(e) => update(i, { description: e.target.value })} />
              </label>
              <p className="muted small mono" aria-label={`รหัสเครื่องของ ${label}`}>
                รหัสเครื่อง: 11 {bits3(ins.func)} {ins.operands.includes('rd') ? 'rd' : '--'} {ins.operands.some((o) => o !== 'rd') ? 'm src(8)' : '- --------'}
              </p>
              {mine.length > 0 ? (
                <ul className="isa-issues" aria-label={`ข้อผิดพลาดของ ${label}`}>
                  {mine.map((x, k) => (
                    <li key={k} className="error small with-icon">
                      <AlertTriangle size={14} aria-hidden /> {x.message.th}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
      <button onClick={add} disabled={ext.instructions.length >= CUSTOM_SLOTS}>
        <Plus size={16} aria-hidden /> เพิ่มคำสั่ง
      </button>

      <div role="status" aria-live="polite" className="small isa-status" data-testid="isa-status">
        {fileIssues.map((x, k) => (
          <p key={k} className="error">
            {x.message.th}
          </p>
        ))}
        {issues.length === 0 ? (
          <p className="with-icon">
            <CheckCircle2 size={16} aria-hidden className="pass-icon" /> พร้อมใช้ {compiled.length} คำสั่ง
          </p>
        ) : (
          <p className="with-icon">
            <AlertTriangle size={16} aria-hidden /> ใช้ได้ {compiled.length} จาก {ext.instructions.length} คำสั่ง (คำสั่งที่ยังผิดจะไม่ถูกใช้)
          </p>
        )}
        {notice ? <p>{notice}</p> : null}
      </div>

      <details className="isa-help">
        <summary>เขียนสูตรอย่างไร</summary>
        <ul className="small">
          <li>
            เขียนทีละส่วนแบบ <code>ที่จะเขียน = ค่า</code> คั่นด้วย <code>;</code> เช่น <code>CF = rd &amp; 1; rd = rd &gt;&gt; 1</code>
          </li>
          <li>
            อ่านได้: <code>rd</code> <code>src</code> (register หรือค่าคงที่) <code>A B C D</code> <code>Z CF N</code> (flags, ตัวทดใช้ CF เพราะ C คือ register)
            <code>PC</code> <code>SP</code> และ <code>mem[address]</code>
          </li>
          <li>
            เขียนได้: <code>rd</code> <code>A–D</code> <code>Z CF N</code> <code>PC</code> (กระโดด) <code>SP</code> และ <code>mem[address]</code> ได้หนึ่งที่ต่อคำสั่ง
          </li>
          <li>
            เครื่องหมาย: <code>+ - * &amp; | ^ ~ &lt;&lt; &gt;&gt; == != &lt; &lt;= &gt; &gt;= &amp;&amp; || !</code> และ <code>เงื่อนไข ? ค่าถ้าจริง : ค่าถ้าไม่จริง</code>
          </li>
          <li>
            ทุกสูตรอ่านค่า <strong>ก่อน</strong>คำสั่ง แล้วเขียนพร้อมกันตอนขอบนาฬิกา (แบบเดียวกับวงจร) register เก็บ 8 บิต flag เป็น 1 ถ้าค่าไม่ใช่ 0 ส่วน PC ที่ไม่ได้เขียนไปคำสั่งถัดไป
          </li>
          <li>
            ตัวอย่าง: <code>INC rd</code> → <code>rd = rd + 1</code> · <code>JNC src</code> → <code>PC = CF ? PC + 1 : src</code> · <code>SHL rd</code> →{' '}
            <code>CF = rd &gt;&gt; 7; rd = rd &lt;&lt; 1</code>
          </li>
        </ul>
      </details>
    </section>
  );
}

// แสดงบทเรียน Markdown แบบย่อ: หัวข้อ, ย่อหน้า, รายการ, ตาราง, **ตัวหนา**, *ตัวเอียง* และ `โค้ด`
// สร้าง React element เอง ไม่ใช้ innerHTML จึงไม่มีทางที่ข้อความในไฟล์จะกลายเป็น HTML/สคริปต์
import type { ReactNode } from 'react';

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${keyBase}-${k++}`}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<code key={`${keyBase}-${k++}`}>{m[2]}</code>);
    else out.push(<em key={`${keyBase}-${k++}`}>{m[3]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function Markdown({ text, headingOffset = 1 }: { text: string; headingOffset?: number }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${i}`;
    if (line.trim() === '') {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(6, h[1]!.length + headingOffset);
      const Tag = `h${level}` as 'h2';
      blocks.push(<Tag key={key}>{inline(h[2]!, key)}</Tag>);
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        const r = cells(lines[i]!);
        if (!r.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(r);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <table key={key} className="md-table">
          {head ? (
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, `${key}h${j}`)}</th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c, `${key}r${ri}c${j}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ''));
      blocks.push(
        <ul key={key}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}l${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !/^(#{1,4}\s|\||\s*[-*]\s)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={key}>{inline(para.join(' '), key)}</p>);
  }
  return <div className="markdown">{blocks}</div>;
}

// อุปกรณ์แสดงผลบนหน้าจอ (Spec ส่วน 10): จอ 7 ส่วน, จอตัวเลข และ LED 8 ดวง
// ทุกตัวมี aria-label บอกค่าเป็นข้อความ ไม่ได้บอกค่าด้วยสีหรือรูปอย่างเดียว (Spec ส่วน 16)
import type { DeviceKind, SignalValue } from '@z-ncpu/shared';

/** ตำแหน่งขีด a–g ใน viewBox 60×100 */
const SEGMENTS: [string, string][] = [
  ['a', 'M12 6 L48 6 L42 12 L18 12 Z'],
  ['b', 'M50 8 L50 46 L44 42 L44 14 Z'],
  ['c', 'M50 54 L50 92 L44 86 L44 58 Z'],
  ['d', 'M12 94 L48 94 L42 88 L18 88 Z'],
  ['e', 'M10 54 L10 92 L16 86 L16 58 Z'],
  ['f', 'M10 8 L10 46 L16 42 L16 14 Z'],
  ['g', 'M12 50 L18 45 L42 45 L48 50 L42 55 L18 55 Z'],
];

export function SevenSegment({ label, value }: { label: string; value: SignalValue | undefined }) {
  const v = typeof value === 'number' ? value : null;
  const on = SEGMENTS.filter((_, i) => v !== null && ((v >> i) & 1) === 1).map(([n]) => n);
  return (
    <div className="device seg7" role="status" aria-label={`${label} = ${v === null ? 'X' : `ขีดที่ติด ${on.join(' ') || 'ไม่มี'}`}`}>
      <svg viewBox="0 0 60 100" width="60" height="100" aria-hidden>
        {SEGMENTS.map(([name, d], i) => (
          <path key={name} d={d} className={v !== null && ((v >> i) & 1) === 1 ? 'seg on' : v === null ? 'seg unknown' : 'seg'} />
        ))}
      </svg>
      <span className="device-label">{label}</span>
    </div>
  );
}

export function NumberDisplay({ label, value, width }: { label: string; value: SignalValue | undefined; width: number }) {
  const text = typeof value === 'number' ? String(value) : 'X';
  const hex = typeof value === 'number' ? value.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0') : '';
  return (
    <div className="device number" role="status" aria-label={`${label} = ${text}`}>
      <span className="device-big mono">{text}</span>
      <span className="device-label">
        {label} {hex ? <span className="mono muted">0x{hex}</span> : null}
      </span>
    </div>
  );
}

export function LedBar({ label, value, width }: { label: string; value: SignalValue | undefined; width: number }) {
  const v = typeof value === 'number' ? value : null;
  return (
    <div className="device leds" role="status" aria-label={`${label} = ${v === null ? 'X' : v.toString(2).padStart(width, '0')}`}>
      <div className="led-row" aria-hidden>
        {Array.from({ length: width }, (_, k) => width - 1 - k).map((i) => (
          <span key={i} className={`led-dot ${v !== null && ((v >> i) & 1) === 1 ? 'on' : v === null ? 'x' : ''}`} />
        ))}
      </div>
      <span className="device-label">{label}</span>
    </div>
  );
}

export function Device(props: { kind: DeviceKind; label: string; value: SignalValue | undefined; width: number }) {
  if (props.kind === 'seg7') return <SevenSegment label={props.label} value={props.value} />;
  if (props.kind === 'leds') return <LedBar label={props.label} value={props.value} width={props.width} />;
  return <NumberDisplay label={props.label} value={props.value} width={props.width} />;
}

// ชิ้น UI เล็กๆ ที่ใช้หลายหน้า
import type { Diagnostic, SignalValue } from '@z-ncpu/shared';

export function Switch(props: { label: string; value: SignalValue | undefined; onClick: () => void; disabled?: boolean }) {
  const on = props.value === 1;
  return (
    <button
      className={`switch ${on ? 'on' : 'off'}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={on}
      aria-label={`สวิตช์ ${props.label} = ${valueText(props.value)}`}
    >
      <span className="switch-label">{props.label}</span>
      <span className="switch-value">{valueText(props.value)}</span>
    </button>
  );
}

export function Led(props: { label: string; value: SignalValue | undefined }) {
  const v = props.value;
  const cls = v === 1 ? 'high' : v === 0 ? 'low' : 'unknown';
  return (
    <div className={`led ${cls}`} role="status" aria-label={`${props.label} = ${valueText(v)}`}>
      <span className="led-dot" />
      <span className="led-label">{props.label}</span>
      <span className="led-value">{valueText(v)}</span>
    </div>
  );
}

export function Diagnostics({ items }: { items: Diagnostic[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="diagnostics">
      {items.map((d, i) => (
        <li key={i} className={d.severity}>
          {d.severity === 'error' ? '⚠ ' : 'ℹ '}
          {d.message.th}
        </li>
      ))}
    </ul>
  );
}

/** ไม่บอกค่าด้วยสีอย่างเดียว (Spec ส่วน 16) */
export function valueText(v: SignalValue | undefined): string {
  if (v === 1) return '1 HIGH';
  if (v === 0) return '0 LOW';
  return 'X';
}

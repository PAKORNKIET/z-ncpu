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

export function Led(props: { label: string; value: SignalValue | undefined; width?: number }) {
  const v = props.value;
  const width = props.width ?? 1;
  if (width > 1) {
    // บัส: แสดงเป็นตัวเลขฐานสิบและฐานสอง
    const text = typeof v === 'number' ? `${v} (${v.toString(2).padStart(width, '0')})` : 'X';
    return (
      <div className={`led bus ${typeof v === 'number' ? 'known' : 'unknown'}`} role="status" aria-label={`${props.label} = ${text}`}>
        <span className="led-label">{props.label}</span>
        <span className="led-bus-value mono">{text}</span>
      </div>
    );
  }
  const cls = v === 1 ? 'high' : v === 0 ? 'low' : 'unknown';
  return (
    <div className={`led ${cls}`} role="status" aria-label={`${props.label} = ${valueText(v)}`}>
      <span className="led-dot" />
      <span className="led-label">{props.label}</span>
      <span className="led-value">{valueText(v)}</span>
    </div>
  );
}

/** ขาเข้าแบบบัส: กดทีละบิต (บิตซ้ายสุดคือบิตสูงสุด) และแสดงค่าเป็นตัวเลข */
export function BusInput(props: { label: string; width: number; value: number; onChange: (v: number) => void }) {
  const { width, value } = props;
  const bits = Array.from({ length: width }, (_, i) => width - 1 - i);
  return (
    <fieldset className="bus-input">
      <legend>
        {props.label} = <span className="mono">{value}</span>
      </legend>
      <div className="bus-bits">
        {bits.map((i) => {
          const on = ((value >> i) & 1) === 1;
          return (
            <button
              key={i}
              className={`bit ${on ? 'on' : ''}`}
              aria-pressed={on}
              aria-label={`${props.label} บิต ${i}`}
              onClick={() => props.onChange(value ^ (1 << i))}
            >
              {on ? 1 : 0}
            </button>
          );
        })}
      </div>
    </fieldset>
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
  if (typeof v === 'number') return String(v);
  return 'X';
}

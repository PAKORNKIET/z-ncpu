// เมนูคลิกขวา (และกดค้างบนจอสัมผัส) ของพื้นที่วาดวงจร
// ใช้คีย์บอร์ดได้: ลูกศรขึ้น/ลง เลือก, Enter ทำ, Esc ปิด แล้วโฟกัสกลับไปที่พื้นที่วาด
import type { LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface MenuItem {
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}

/** null = เส้นคั่น */
export type MenuEntry = MenuItem | null;

export function ContextMenu(props: { x: number; y: number; title: string; items: MenuEntry[]; onClose: (refocus: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: props.x, top: props.y });
  const close = useRef(props.onClose);
  close.current = props.onClose;

  // ไม่ให้เมนูล้นจอ: ชิดขอบแล้วพลิกขึ้น/ไปทางซ้าย
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    const left = props.x + width + pad > window.innerWidth ? Math.max(pad, props.x - width) : props.x;
    const top = props.y + height + pad > window.innerHeight ? Math.max(pad, props.y - height) : props.y;
    setPos({ left, top });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [props.x, props.y]);

  useEffect(() => {
    const outside = (e: Event): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current(false);
    };
    const away = (): void => close.current(false);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', away);
    window.addEventListener('scroll', away, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('blur', away);
      window.removeEventListener('resize', away);
      window.removeEventListener('scroll', away, true);
    };
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const go = (k: number): void => buttons[(k + buttons.length) % buttons.length]?.focus();
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(buttons.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') close.current(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={ref} className="ctx-menu" role="menu" aria-label={props.title} style={pos} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}>
      <div className="ctx-title muted small" aria-hidden>
        {props.title}
      </div>
      {props.items.map((item, k) =>
        item === null ? (
          <div key={k} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={k}
            role="menuitem"
            className={item.danger ? 'danger' : undefined}
            disabled={item.disabled}
            onClick={() => {
              close.current(true);
              item.run();
            }}
          >
            <item.icon size={16} aria-hidden />
            <span className="ctx-label">{item.label}</span>
            {item.shortcut ? <kbd className="muted small">{item.shortcut}</kbd> : null}
          </button>
        ),
      )}
    </div>
  );
}

// Time travel + Logic Analyzer (Spec ส่วน 9)
// แถบเวลาย้อนไปดู cycle ใดก็ได้ที่บันทึกไว้ และ timing diagram ของขาที่เลือก (บิตเดี่ยวเป็นคลื่น บัสเป็นช่องพร้อมค่าฐานสิบหก)
import { Activity, ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { EngineClient } from '../engine-client';
import { EngineClosedError } from '../engine-client';

export interface HistoryInfo {
  first: number;
  last: number;
  pins: { name: string; width: number }[];
}

/** จำนวน cycle ที่แสดงในหนึ่งหน้าจอ */
const WINDOW = 40;
const COL = 22;
const ROW = 30;
const LABEL = 64;
const DEFAULT_PROBES = ['pc', 'a', 'flags', 'out', 'halt'];

const hex = (v: number, width: number): string => v.toString(16).toUpperCase().padStart(Math.ceil(width / 4), '0');

export function LogicAnalyzer(props: {
  client: EngineClient | null;
  history: HistoryInfo | null;
  cycle: number;
  running: boolean;
  /** เดินหน้าเมื่ออยู่ที่ cycle ล่าสุดแล้ว (เดินนาฬิกาจริง) */
  onStep: () => void;
}) {
  const { client, history, cycle, running } = props;
  const [probes, setProbes] = useState<string[]>(DEFAULT_PROBES);
  const [data, setData] = useState<{ from: number; columns: Record<string, (number | null)[]> } | null>(null);
  const last = history?.last ?? 0;
  const first = history?.first ?? 0;
  const from = Math.max(first, Math.min(cycle - Math.floor(WINDOW * 0.75), last - WINDOW + 1));
  const to = from + WINDOW - 1;
  const shown = (history?.pins ?? []).filter((p) => probes.includes(p.name));
  const busy = useRef(false);
  const lastAsk = useRef(0);

  // ขอข้อมูลช่วงที่แสดง (ตอนรันอยู่ขอไม่เกิน ~5 ครั้งต่อวินาที)
  useEffect(() => {
    if (!client || !history || shown.length === 0) return;
    const now = performance.now();
    if (running && (busy.current || now - lastAsk.current < 200)) return;
    busy.current = true;
    lastAsk.current = now;
    client
      .send({ type: 'trace', from, to, pins: shown.map((p) => p.name) })
      .then((res) => {
        if (res.type === 'traceData') setData({ from: res.from, columns: res.columns });
      })
      .catch((e: unknown) => {
        if (!(e instanceof EngineClosedError)) console.error(e);
      })
      .finally(() => {
        busy.current = false;
      });
  }, [client, from, to, last, first, probes.join(','), running && Math.floor(cycle / 8)]);

  const seek = (c: number): void => client?.post({ type: 'seek', cycle: c });
  const inPast = cycle < last;
  const width = LABEL + WINDOW * COL;

  return (
    <section className="analyzer" aria-labelledby="la-title">
      <h2 id="la-title" className="with-icon">
        <Activity size={18} aria-hidden /> Time travel และ Logic Analyzer
      </h2>
      <div className="tt-controls" role="toolbar" aria-label="time travel">
        <button onClick={() => seek(first)} disabled={!history || running || cycle <= first} aria-label="ไป cycle แรกที่บันทึกไว้">
          <SkipBack size={16} aria-hidden />
        </button>
        <button onClick={() => seek(cycle - 1)} disabled={!history || running || cycle <= first}>
          <ChevronLeft size={16} aria-hidden />
          ย้อน 1 cycle
        </button>
        <button onClick={() => (inPast ? seek(cycle + 1) : props.onStep())} disabled={!history || running}>
          เดินหน้า 1 cycle
          <ChevronRight size={16} aria-hidden />
        </button>
        <button onClick={() => seek(last)} disabled={!history || running || !inPast}>
          <SkipForward size={16} aria-hidden />
          ปัจจุบัน
        </button>
        <input
          type="range"
          aria-label="cycle ที่กำลังดู"
          min={first}
          max={Math.max(first, last)}
          value={Math.min(cycle, last)}
          disabled={!history || running || last === first}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="small mono" data-testid="tt-position">
          {cycle} / {last}
        </span>
      </div>
      <p className="small muted" role="status" aria-live="polite">
        {inPast
          ? `กำลังดูอดีตที่ cycle ${cycle} · ถ้าเดินนาฬิกาหรือรันต่อจากตรงนี้ ประวัติหลัง cycle ${cycle} จะถูกแทนด้วยเส้นเวลาใหม่`
          : `ย้อนดูได้ตั้งแต่ cycle ${first} (เก็บ keyframe ทุก 256 cycle แล้วจำลองซ้ำจาก keyframe ที่ใกล้ที่สุด)`}
      </p>

      <fieldset className="probes">
        <legend className="small">ขาที่แสดง</legend>
        {(history?.pins ?? []).map((p) => (
          <label key={p.name} className="small">
            <input
              type="checkbox"
              checked={probes.includes(p.name)}
              onChange={(e) => setProbes((list) => (e.target.checked ? [...list, p.name] : list.filter((x) => x !== p.name)))}
            />{' '}
            {p.name}
          </label>
        ))}
      </fieldset>

      <div className="la-scroll">
        <svg
          className="la"
          width={width}
          height={ROW * (shown.length + 1)}
          role="img"
          aria-label={`timing diagram cycle ${from} ถึง ${to}`}
          onClick={(e) => {
            if (running || !history) return;
            const box = e.currentTarget.getBoundingClientRect();
            const c = from + Math.floor((e.clientX - box.left - LABEL) / COL);
            if (c >= first && c <= last) seek(c);
          }}
        >
          {/* แกนเวลา */}
          {Array.from({ length: WINDOW }, (_, i) => from + i).map((c, i) =>
            c % 5 === 0 ? (
              <text key={c} x={LABEL + i * COL + COL / 2} y={ROW - 10} className="la-axis" textAnchor="middle">
                {c}
              </text>
            ) : null,
          )}
          {cycle >= from && cycle <= to ? (
            <rect x={LABEL + (cycle - from) * COL} y={ROW - 6} width={COL} height={ROW * shown.length + 6} className="la-cursor" />
          ) : null}
          {shown.map((p, row) => {
            const y = ROW * (row + 1);
            const values = data && data.from === from ? (data.columns[p.name] ?? []) : [];
            return (
              <g key={p.name} data-probe={p.name}>
                <text x={4} y={y + ROW / 2 + 4} className="la-label">
                  {p.name}
                </text>
                <line x1={LABEL} x2={width} y1={y + ROW - 1} y2={y + ROW - 1} className="la-grid" />
                {p.width === 1 ? <BitWave values={values} y={y} /> : <BusWave values={values} y={y} width={p.width} />}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="small muted">คลิกบนแผนภาพเพื่อย้อนไป cycle นั้น · ค่าของบัสเป็นเลขฐานสิบหก · ช่องสีเทาคือยังไม่รู้ค่า (X) หรือยังไม่ได้บันทึก</p>
    </section>
  );
}

function BitWave({ values, y }: { values: (number | null)[]; y: number }) {
  // 1 สว่างและหนา, 0 จางและบาง (Spec ส่วน 14) เส้นขอบตอนเปลี่ยนค่าเป็นเส้นบาง
  const hi = y + 6;
  const lo = y + ROW - 8;
  return (
    <>
      {values.map((v, i) => {
        const x = LABEL + i * COL;
        if (v === null) return <rect key={i} x={x} y={hi} width={COL} height={lo - hi} className="la-x" />;
        const prev = values[i - 1];
        return (
          <g key={i}>
            {prev !== undefined && prev !== null && prev !== v ? <line x1={x} x2={x} y1={hi} y2={lo} className="la-edge" /> : null}
            <line x1={x} x2={x + COL} y1={v ? hi : lo} y2={v ? hi : lo} className={v ? 'la-high' : 'la-low'} />
          </g>
        );
      })}
    </>
  );
}

function BusWave({ values, y, width }: { values: (number | null)[]; y: number; width: number }) {
  // รวม cycle ที่ค่าเท่ากันติดกันเป็นช่องเดียว
  const runs: { start: number; len: number; v: number | null }[] = [];
  values.forEach((v, i) => {
    const r = runs[runs.length - 1];
    if (r && r.v === v) r.len++;
    else runs.push({ start: i, len: 1, v });
  });
  const top = y + 6;
  const bottom = y + ROW - 8;
  const mid = (top + bottom) / 2;
  return (
    <>
      {runs.map((r) => {
        const x0 = LABEL + r.start * COL;
        const x1 = x0 + r.len * COL;
        if (r.v === null) return <rect key={r.start} x={x0} y={top} width={x1 - x0} height={bottom - top} className="la-x" />;
        const d = `M${x0} ${mid} L${x0 + 3} ${top} L${x1 - 3} ${top} L${x1} ${mid} L${x1 - 3} ${bottom} L${x0 + 3} ${bottom} Z`;
        const label = hex(r.v, width);
        return (
          <g key={r.start}>
            <path d={d} className="la-bus" />
            {label.length * 7 + 4 <= x1 - x0 ? (
              <text x={(x0 + x1) / 2} y={mid + 4} textAnchor="middle" className="la-value">
                {label}
              </text>
            ) : null}
          </g>
        );
      })}
    </>
  );
}

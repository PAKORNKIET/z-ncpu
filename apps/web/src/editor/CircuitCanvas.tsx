// พื้นที่วาดวงจร: ส่งเหตุการณ์เมาส์/คีย์บอร์ดให้ Interaction และวาดด้วย Canvas2DRenderer ทุกครั้งที่มีอะไรเปลี่ยน
import { Canvas2DRenderer, ghostNode, type Frame } from '@z-ncpu/canvas';
import type { SignalValue } from '@z-ncpu/shared';
import { useEffect, useRef, type DragEvent, type PointerEvent } from 'react';
import type { EditorModel } from './model';

/** ชนิดข้อมูลตอนลากชิ้นส่วนจากกล่องเครื่องมือ */
export const DND_TYPE = 'application/x-zncpu-def';

declare global {
  interface Window {
    /** ใช้ใน E2E เท่านั้น เปิดเมื่อ URL มี ?test (อ่านตำแหน่งขาบนจอ ไม่แก้อะไร) */
    __zncpuTest?: { pin(inst: string, pin: string): { x: number; y: number } | undefined };
  }
}

export function CircuitCanvas(props: { model: EditorModel; values: Record<string, SignalValue> }) {
  const { model, values } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valuesRef = useRef(values);
  const requestRef = useRef<() => void>(() => {});

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const renderer = new Canvas2DRenderer(canvas);
    const styles = getComputedStyle(canvas);
    const color = (v: string): string => styles.getPropertyValue(v).trim() || '#888';
    let frame = 0;
    let fitted = false;

    const draw = (): void => {
      frame = 0;
      const { ui, editor } = model;
      const overlay = ui.overlay();
      const f: Frame = {
        scene: model.scene(),
        camera: ui.camera,
        values: valuesRef.current,
        selection: editor.selection,
        overlay,
        color,
      };
      if (overlay.placing) {
        const g = ghostNode(overlay.placing.defId, overlay.placing.center, model.sceneOptions, overlay.placing.params);
        if (g) f.ghost = g;
      }
      renderer.render(f);
      canvas.style.cursor = ui.cursor();
    };
    const request = (): void => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    requestRef.current = request;

    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      renderer.resize(box.width, box.height, window.devicePixelRatio || 1);
      if (!fitted && box.width > 0 && box.height > 0) {
        fitted = true;
        model.fit(box.width, box.height);
      }
      request();
    });
    ro.observe(wrap);
    const off = model.listen(request);

    // ต้องเป็น passive: false จึงกันไม่ให้หน้าเลื่อนตอนซูมได้
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      model.ui.wheel({ x: e.clientX - r.left, y: e.clientY - r.top }, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    // ฟอนต์ไทยโหลดเสร็จแล้ววาดใหม่ให้ตัวหนังสือถูกฟอนต์
    void document.fonts?.ready.then(request);

    if (new URLSearchParams(location.search).has('test')) {
      window.__zncpuTest = {
        pin: (inst, pin) => {
          const p = model.ui.pinOnScreen({ inst, pin });
          const r = canvas.getBoundingClientRect();
          return p && { x: r.left + p.x, y: r.top + p.y };
        },
      };
    }

    return () => {
      ro.disconnect();
      off();
      canvas.removeEventListener('wheel', wheel);
      if (frame) cancelAnimationFrame(frame);
      renderer.destroy();
      delete window.__zncpuTest;
    };
  }, [model]);

  useEffect(() => {
    valuesRef.current = values;
    requestRef.current();
  }, [values]);

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, button: e.button, shift: e.shiftKey };
  };

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      onDragOver={(e: DragEvent) => {
        if (e.dataTransfer.types.includes(DND_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e: DragEvent) => {
        const defId = e.dataTransfer.getData(DND_TYPE);
        if (!defId) return;
        e.preventDefault();
        const r = canvasRef.current!.getBoundingClientRect();
        model.ui.dropAt({ x: e.clientX - r.left, y: e.clientY - r.top }, { defId });
        canvasRef.current!.focus();
      }}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="พื้นที่ต่อวงจร: ลากขาไปหาอีกขาเพื่อต่อสาย ลากชิ้นส่วนเพื่อย้าย ล้อเมาส์เพื่อซูม"
        onPointerDown={(e) => {
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          model.ui.pointerDown(pos(e));
        }}
        onPointerMove={(e) => model.ui.pointerMove(pos(e))}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          model.ui.pointerUp(pos(e));
        }}
        onPointerCancel={() => model.ui.cancel()}
        onPointerLeave={() => model.ui.pointerLeave()}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

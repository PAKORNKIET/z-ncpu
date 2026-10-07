// รวม Editor (ข้อมูลวงจร + undo) กับ Interaction (เมาส์/คีย์บอร์ด) และ cache ของ Scene ไว้ที่เดียว
// React อ่านสถานะผ่าน useEditorModel ส่วน canvas วาดเองนอก React เพื่อไม่ให้ render ซ้ำทุกครั้งที่ขยับเมาส์

import {
  buildScene,
  Editor,
  fitCamera,
  Interaction,
  type Scene,
  type SceneOptions,
} from '@z-ncpu/canvas';
import { ComponentLibrary, PRIMITIVES } from '@z-ncpu/engine';
import type { ComponentDef, PinRef } from '@z-ncpu/shared';
import { useState, useSyncExternalStore } from 'react';

const SHORT_TITLE: Record<string, string> = {
  'prim.nand': 'NAND',
  'prim.const0': '0',
  'prim.const1': '1',
  'prim.clock': 'CLK',
  'prim.split': 'แยก',
  'prim.merge': 'รวม',
  'prim.panel': 'แผง',
};

export class EditorModel {
  readonly editor: Editor;
  readonly ui: Interaction;
  readonly sceneOptions: SceneOptions;
  /** host ตั้งค่า: คลิกขาเข้าของวงจรบน canvas */
  onToggleInput: (pin: string) => void = () => {};
  /** host ตั้งค่า: ดับเบิลคลิกชิ้นส่วนเพื่อดูข้างใน */
  onOpen: (instanceId: string) => void = () => {};
  /** host ตั้งค่า: โหมด Why? คลิกขา/สายเพื่อถามว่าค่ามาจากไหน */
  onProbe: (ref: PinRef) => void = () => {};
  private cache: { def: ComponentDef; scene: Scene } | null = null;
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(
    initial: ComponentDef,
    readonly library = new ComponentLibrary(),
    options: { readOnly?: boolean } = {},
  ) {
    const pinsOf = library.pinsOf.bind(library);
    this.sceneOptions = {
      pinsOf,
      titleOf: (defId) => SHORT_TITLE[defId] ?? library.get(defId)?.name.th ?? PRIMITIVES.get(defId)?.name.th ?? defId,
    };
    this.editor = new Editor(initial, pinsOf);
    this.ui = new Interaction(this.editor, {
      scene: () => this.scene(),
      onToggleInput: (pin) => this.onToggleInput(pin),
      onOpen: (id) => this.onOpen(id),
      onProbe: (ref) => this.onProbe(ref),
      onChange: () => this.emit(),
      readOnly: !!options.readOnly,
    });
    this.editor.history.subscribe(() => {
      this.version++;
      this.emit();
    });
  }

  scene(): Scene {
    const def = this.editor.def;
    if (this.cache?.def !== def) this.cache = { def, scene: buildScene(def, this.sceneOptions) };
    return this.cache.scene;
  }

  /** ปรับกล้องให้เห็นวงจรทั้งหมด */
  fit(width: number, height: number): void {
    const b = this.scene().bounds;
    const pad = 60;
    const cam = fitCamera({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }, width, height);
    this.ui.setCamera({ ...cam, zoom: Math.min(cam.zoom, 1.25) });
  }

  /** แจ้งเตือนเมื่อมีอะไรเปลี่ยน (ทั้งที่ต้องวาดใหม่และที่ React ต้องรู้) */
  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** ค่าที่ React ใช้ตัดสินว่าต้อง render ใหม่ไหม (เปลี่ยนเฉพาะเมื่อสิ่งที่แสดงบน toolbar/แผงข้างเปลี่ยน) */
  snapshot = (): string => {
    const { editor, ui } = this;
    return [
      this.version,
      editor.selection.instances.join(','),
      editor.selection.wires.join(','),
      ui.placing?.defId ?? '',
      ui.wiring ? 'w' : '',
      editor.lastError?.th ?? '',
      Math.round(ui.camera.zoom * 100),
    ].join('|');
  };

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

/** สร้าง model ครั้งเดียวต่อ component และ render ใหม่เมื่อสถานะที่แสดงผลเปลี่ยน */
export function useEditorModel(init: () => { def: ComponentDef; library?: ComponentLibrary }): EditorModel {
  const [model] = useState(() => {
    const { def, library } = init();
    return new EditorModel(def, library);
  });
  useSyncExternalStore(
    (cb) => model.listen(cb),
    model.snapshot,
  );
  return model;
}

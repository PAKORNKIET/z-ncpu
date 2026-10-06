// Editor = วงจรที่กำลังแก้ + ประวัติ undo/redo + selection
// UI (React/Canvas) เรียกเมธอดพวกนี้เท่านั้น ไม่แก้ ComponentDef เอง

import type { ComponentDef, LocalizedText, PinRef } from '@z-ncpu/shared';
import { History } from './history';
import {
  addInstance,
  connect,
  moveInstances,
  removeInstances,
  removeWires,
  rotateInstances,
  setLabel,
  type AddInstanceInput,
  type PinResolver,
} from './ops';

export interface Selection {
  instances: string[];
  wires: string[];
}

const EMPTY: Selection = { instances: [], wires: [] };

export class Editor {
  readonly history: History<ComponentDef>;
  selection: Selection = EMPTY;
  /** ข้อความผิดพลาดล่าสุด (เช่นต่อสายไม่ได้) ให้ UI แสดง */
  lastError: LocalizedText | undefined;
  private dragSeq = 0;

  constructor(
    initial: ComponentDef,
    private readonly pinsOf: PinResolver,
  ) {
    this.history = new History(initial);
  }

  get def(): ComponentDef {
    return this.history.state;
  }

  add(input: AddInstanceInput): string {
    const { def, id } = addInstance(this.def, input);
    this.history.push(def, 'วางชิ้นส่วน');
    this.selection = { instances: [id], wires: [] };
    return id;
  }

  /** เรียกซ้ำได้ระหว่างลาก ทั้งการลากหนึ่งครั้งจะ undo ทีเดียว ปิดด้วย endDrag() */
  drag(ids: readonly string[], dx: number, dy: number): void {
    if (ids.length === 0 || (dx === 0 && dy === 0)) return;
    this.history.push(moveInstances(this.def, ids, dx, dy), 'ย้ายชิ้นส่วน', `drag${this.dragSeq}`);
  }

  endDrag(): void {
    this.dragSeq++;
    this.history.endMerge();
  }

  rotate(ids: readonly string[] = this.selection.instances): void {
    if (ids.length === 0) return;
    this.history.push(rotateInstances(this.def, ids), 'หมุนชิ้นส่วน');
  }

  label(id: string, text: string): void {
    this.history.push(setLabel(this.def, id, text), 'ตั้งชื่อชิ้นส่วน');
  }

  /** ต่อสาย ถ้าต่อไม่ได้คืน false และตั้ง lastError */
  connect(a: PinRef, b: PinRef): boolean {
    const r = connect(this.def, a, b, this.pinsOf);
    if (!r.ok) {
      this.lastError = r.reason;
      return false;
    }
    this.lastError = undefined;
    this.history.push(r.def, 'ต่อสาย');
    return true;
  }

  /** ลบสิ่งที่เลือกอยู่ทั้งชิ้นส่วนและสาย */
  deleteSelection(): void {
    const { instances, wires } = this.selection;
    if (instances.length === 0 && wires.length === 0) return;
    const next = removeInstances(removeWires(this.def, wires), instances);
    this.history.push(next, 'ลบ');
    this.selection = EMPTY;
  }

  select(selection: Partial<Selection>): void {
    this.selection = { instances: selection.instances ?? [], wires: selection.wires ?? [] };
  }

  clearSelection(): void {
    this.selection = EMPTY;
  }

  undo(): boolean {
    this.selection = EMPTY;
    return this.history.undo();
  }

  redo(): boolean {
    this.selection = EMPTY;
    return this.history.redo();
  }
}

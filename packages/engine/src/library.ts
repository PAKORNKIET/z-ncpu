import type { ComponentDef, PinDef } from '@z-ncpu/shared';
import { PRIMITIVES } from './primitives';

/** คลัง ComponentDef ของโปรเจกต์ หนึ่ง id มีได้เวอร์ชันเดียว (Spec ส่วน 5) */
export class ComponentLibrary {
  private readonly defs = new Map<string, ComponentDef>();

  constructor(defs: Iterable<ComponentDef> = []) {
    for (const def of defs) this.add(def);
  }

  add(def: ComponentDef): this {
    if (PRIMITIVES.has(def.id)) {
      throw new Error(`"${def.id}" เป็นชื่อของ primitive ใช้ซ้ำไม่ได้`);
    }
    this.defs.set(def.id, def);
    return this;
  }

  get(id: string): ComponentDef | undefined {
    return this.defs.get(id);
  }

  has(id: string): boolean {
    return this.defs.has(id) || PRIMITIVES.has(id);
  }

  all(): ComponentDef[] {
    return [...this.defs.values()];
  }

  /** pin ของ def หรือ primitive; undefined ถ้าไม่รู้จัก; โยน RangeError ถ้า params ผิด */
  pinsOf(defId: string, params?: Record<string, number>): PinDef[] | undefined {
    const prim = PRIMITIVES.get(defId);
    if (prim) return prim.pins(params);
    return this.defs.get(defId)?.pins;
  }
}

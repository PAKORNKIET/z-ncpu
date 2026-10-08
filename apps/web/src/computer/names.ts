// ชื่อที่อ่านง่ายของชิ้นใน path เช่น "alu81/add1" → "ALU 8 บิต" จากวงจรของผู้เล่น
import type { ComponentDef } from '@z-ncpu/shared';

export interface PartName {
  /** ชื่อชิ้นส่วน (ชื่อ label ถ้าตั้งไว้ ไม่งั้นชื่อของ def) */
  name: string;
  /** ชื่อ instance ในวงจร */
  id: string;
}

export function partNamer(components: readonly ComponentDef[], rootDefId: string): (path: string) => PartName {
  const defs = new Map(components.map((c) => [c.id, c]));
  const cache = new Map<string, { def: ComponentDef | undefined; part: PartName }>();
  const root = defs.get(rootDefId);
  const resolve = (path: string): { def: ComponentDef | undefined; part: PartName } => {
    const hit = cache.get(path);
    if (hit) return hit;
    let out: { def: ComponentDef | undefined; part: PartName };
    if (path === '') {
      out = { def: root, part: { name: root?.name.th ?? rootDefId, id: '' } };
    } else {
      const cut = path.lastIndexOf('/');
      const parent = resolve(cut === -1 ? '' : path.slice(0, cut));
      const id = path.slice(cut + 1);
      const inst = parent.def?.body?.instances.find((i) => i.id === id);
      const def = inst ? defs.get(inst.defId) : undefined;
      out = { def, part: { name: inst?.label?.trim() || def?.name.th || id, id } };
    }
    cache.set(path, out);
    return out;
  };
  return (path) => resolve(path).part;
}

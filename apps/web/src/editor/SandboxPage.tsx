// สนามทดลอง: ต่อวงจรอะไรก็ได้จาก NAND ค่าคงที่ และชิ้นที่ปลดล็อกแล้ว (ไม่มีการตรวจคำตอบ ไม่บันทึก)
import type { ComponentDef } from '@z-ncpu/shared';
import { LEVELS } from '@z-ncpu/content';
import { paletteFor } from '../game/GamePage';
import { availableParts } from '../game/progress';
import type { SaveFile } from '../game/save';
import { Workbench } from './Workbench';

const sandbox = (): ComponentDef => ({
  id: 'user.sandbox',
  name: { th: 'สนามทดลอง', en: 'Sandbox' },
  kind: 'circuit',
  pins: [
    { name: 'a', dir: 'in', width: 1 },
    { name: 'b', dir: 'in', width: 1 },
    { name: 'y', dir: 'out', width: 1 },
  ],
  body: { instances: [], wires: [] },
});

export function SandboxPage({ save }: { save: SaveFile }) {
  // ชิ้นของผู้เล่นทุกชิ้นที่ผ่านด่านแล้ว
  const unlocked = LEVELS.flatMap((l) => availableParts({ ...l, available: l.unlocks }, LEVELS, save));
  return (
    <Workbench
      initial={sandbox()}
      deps={save.components}
      palette={paletteFor(['prim.nand', 'prim.const0', 'prim.const1', ...unlocked])}
    />
  );
}

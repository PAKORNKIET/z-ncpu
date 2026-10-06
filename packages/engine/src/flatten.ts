import type { ComponentDef, Diagnostic, PinDef, PinRef } from '@z-ncpu/shared';
import { err, hasErrors, warn } from './diag';
import type { ComponentLibrary } from './library';
import { panelShape, PRIMITIVES, type PrimitiveSpec } from './primitives';

/**
 * Netlist ระดับบิต มีแต่ NAND (Spec ส่วน 6.1)
 * 1 net = 1 บิต และ bus ถูกคลี่ออกเป็นหลาย net (บิต 0 = LSB)
 */
export interface Netlist {
  topId: string;
  netCount: number;
  gateCount: number;
  gateA: Int32Array;
  gateB: Int32Array;
  gateY: Int32Array;
  /** path ของแต่ละเกตในลำดับชั้น เช่น "fa2/xor1/nand3" */
  gatePath: string[];
  constNets: Int32Array;
  constValues: Uint8Array;
  clockNets: Int32Array;
  /** แผงค่าคงที่ทุกตัวในวงจร simulator เป็นคนตั้งค่าตามโปรแกรม (Spec ส่วน 11) */
  panels: PanelInfo[];
  inputs: Map<string, Int32Array>;
  outputs: Map<string, Int32Array>;
  /**
   * ชิ้นส่วนแยกตามชั้น (Spec ส่วน 14) ใช้ระบายสีสายบนหน้าจอและ X-Ray ผ่าน scopePins()
   * key ชั้น: '' = ชั้นบนสุด, 'fa2' = ข้างใน fa2, 'fa2/xor1' = ข้างใน xor1 ที่อยู่ใน fa2
   * เก็บเป็น node ดิบ (แปลงเป็น net ผ่าน nodeNet ตอนอ่าน) compile จะได้ไม่ช้าลงเพราะต้องสร้างตารางของทุกขา
   */
  scopes: Map<string, ScopeInstance[]>;
  /** node ภายใน → net */
  nodeNet: Int32Array;
  inputPins: PinDef[];
  outputPins: PinDef[];
  /** ชื่อของ pin ที่อยู่บน net นั้น (ไม่เกิน maxNamesPerNet ชื่อ) ใช้กับ Probe และ Why? */
  netNames: string[][];
  /** CSR: เกตที่อ่าน net i อยู่ที่ fanoutGates[fanoutStart[i] .. fanoutStart[i+1]) */
  fanoutStart: Int32Array;
  fanoutGates: Int32Array;
  /** เกตที่ขับ net นั้น หรือ -1 */
  driverGate: Int32Array;
}

export interface ScopeInstance {
  id: string;
  /** ชื่อขา → node ดิบ */
  pins: Map<string, number[]>;
}

/** net ของขาทุกขาในชั้นหนึ่ง key = "ชื่อชิ้น.ชื่อขา" */
export function scopePins(netlist: Netlist, scope: string): Map<string, Int32Array> {
  const out = new Map<string, Int32Array>();
  for (const inst of netlist.scopes.get(scope) ?? []) {
    for (const [pin, nodes] of inst.pins) out.set(`${inst.id}.${pin}`, Int32Array.from(nodes, (n) => netlist.nodeNet[n] as number));
  }
  return out;
}

export interface PanelInfo {
  /** path ในลำดับชั้น เช่น "rom" หรือ "computer/panel" */
  path: string;
  words: number;
  width: number;
  /** net ของคำที่ i บิตที่ j อยู่ที่ nets[i * width + j] */
  nets: Int32Array;
}

export interface CompileOptions {
  maxNand?: number;
  maxDepth?: number;
  maxNamesPerNet?: number;
}

export interface CompileResult {
  /** null ถ้ามี error */
  netlist: Netlist | null;
  diagnostics: Diagnostic[];
}

export const DEFAULT_LIMITS = { maxNand: 200_000, maxDepth: 32, maxNamesPerNet: 8 } as const;
/** จำนวนข้อความสูงสุดต่อปัญหาหนึ่งชนิด มัดสายกว้าง 4096 บิตจะได้ไม่ขึ้น error 4096 บรรทัด */
const MAX_REPORTS = 20;

class UnionFind {
  readonly parent: number[] = [];
  private readonly size: number[] = [];

  make(): number {
    const id = this.parent.length;
    this.parent.push(id);
    this.size.push(1);
    return id;
  }

  find(x: number): number {
    const p = this.parent;
    while (p[x] !== x) {
      p[x] = p[p[x] as number] as number;
      x = p[x] as number;
    }
    return x;
  }

  union(a: number, b: number): void {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return;
    if ((this.size[ra] as number) < (this.size[rb] as number)) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.size[ra] = (this.size[ra] as number) + (this.size[rb] as number);
  }
}

interface InstEntry {
  path: string;
  params?: Record<string, number>;
  spec?: PrimitiveSpec;
  child?: ComponentDef;
  pins: Map<string, number[]>;
}

/** คลี่วงจร topId ออกเป็น netlist พร้อมตรวจปัญหาที่เจอระหว่างทาง */
export function compile(lib: ComponentLibrary, topId: string, options: CompileOptions = {}): CompileResult {
  const maxNand = options.maxNand ?? DEFAULT_LIMITS.maxNand;
  const maxDepth = options.maxDepth ?? DEFAULT_LIMITS.maxDepth;
  const maxNames = options.maxNamesPerNet ?? DEFAULT_LIMITS.maxNamesPerNet;

  const diagnostics: Diagnostic[] = [];
  const uf = new UnionFind();
  const nodeName: (string | undefined)[] = [];
  const gA: number[] = [];
  const gB: number[] = [];
  const gY: number[] = [];
  const gPath: string[] = [];
  const constNodes: number[] = [];
  const constVals: number[] = [];
  const clockNodes: number[] = [];
  const panelNodes: { path: string; words: number; width: number; nodes: number[] }[] = [];
  let aborted = false;
  /** ชิ้นส่วนแยกตามชั้น */
  const scopeNodes = new Map<string, ScopeInstance[]>();

  const alloc = (width: number, label: string): number[] => {
    const nodes: number[] = [];
    for (let i = 0; i < width; i++) {
      const n = uf.make();
      nodeName[n] = width === 1 ? label : `${label}[${i}]`;
      nodes.push(n);
    }
    return nodes;
  };

  const top = resolveTop(lib, topId);
  if (!top) {
    return {
      netlist: null,
      diagnostics: [err('unknown-def', `ไม่รู้จักวงจร "${topId}"`, `Unknown circuit "${topId}"`, topId)],
    };
  }

  const topPins = new Map<string, number[]>();
  for (const p of top.pins) {
    if (topPins.has(p.name)) {
      diagnostics.push(err('duplicate-id', `มี pin ชื่อ "${p.name}" ซ้ำ`, `Duplicate pin "${p.name}"`, p.name));
      continue;
    }
    topPins.set(p.name, alloc(p.width, p.name));
  }

  const emitPrimitive = (
    spec: PrimitiveSpec,
    pins: Map<string, number[]>,
    path: string,
    params: Record<string, number> | undefined,
  ): void => {
    const pin = (name: string): number[] => pins.get(name) as number[];
    switch (spec.kind) {
      case 'nand': {
        if (gA.length >= maxNand) {
          diagnostics.push(
            err('gate-limit', `วงจรใช้ NAND เกิน ${maxNand} ตัว`, `Circuit exceeds ${maxNand} NAND gates`, path),
          );
          aborted = true;
          return;
        }
        gA.push(pin('a')[0] as number);
        gB.push(pin('b')[0] as number);
        gY.push(pin('y')[0] as number);
        gPath.push(path);
        return;
      }
      case 'const0':
      case 'const1':
        constNodes.push(pin('y')[0] as number);
        constVals.push(spec.kind === 'const1' ? 1 : 0);
        return;
      case 'clock':
        clockNodes.push(pin('clk')[0] as number);
        return;
      case 'split':
      case 'merge': {
        // ส่วนที่ i ของ bus = บิต i*partWidth .. ของ bus เป็นแค่การชี้ net เดิม ไม่เพิ่มเกต
        const bus = pin(spec.kind === 'split' ? 'in' : 'out');
        const partWidth = pin('b0').length;
        bus.forEach((node, k) => uf.union(node, pin(`b${Math.floor(k / partWidth)}`)[k % partWidth] as number));
        return;
      }
      case 'panel': {
        const { words, width } = panelShape(params);
        panelNodes.push({ path, words, width, nodes: pin('out') });
        return;
      }
    }
  };

  const expand = (
    def: ComponentDef,
    path: string,
    pinNodes: Map<string, number[]>,
    depth: number,
    stack: string[],
  ): void => {
    if (aborted) return;
    const where = path === '' ? def.id : path.slice(0, -1);
    if (depth > maxDepth) {
      diagnostics.push(
        err('depth-limit', `วงจรซ้อนกันลึกเกิน ${maxDepth} ชั้น`, `Nesting deeper than ${maxDepth} levels`, where),
      );
      aborted = true;
      return;
    }
    if (stack.includes(def.id)) {
      diagnostics.push(
        err(
          'recursive-def',
          `วงจร "${def.id}" ใช้ตัวเองซ้อนอยู่ข้างใน`,
          `Circuit "${def.id}" contains itself`,
          where,
        ),
      );
      return;
    }
    if (!def.body) {
      diagnostics.push(err('unknown-def', `"${def.id}" ไม่มีวงจรข้างใน`, `"${def.id}" has no body`, where));
      return;
    }
    stack.push(def.id);

    const insts = new Map<string, InstEntry>();
    for (const inst of def.body.instances) {
      const ipath = path + inst.id;
      if (inst.id === 'self' || insts.has(inst.id)) {
        diagnostics.push(err('duplicate-id', `ชื่อชิ้น "${inst.id}" ซ้ำหรือใช้ไม่ได้`, `Invalid or duplicate instance id "${inst.id}"`, ipath));
        continue;
      }
      const spec = PRIMITIVES.get(inst.defId);
      let pinDefs: PinDef[];
      let child: ComponentDef | undefined;
      if (spec) {
        try {
          pinDefs = spec.pins(inst.params);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          diagnostics.push(err('bad-param', `ค่า params ของ ${inst.defId} ไม่ถูกต้อง: ${msg}`, `Invalid params for ${inst.defId}: ${msg}`, ipath));
          continue;
        }
      } else {
        child = lib.get(inst.defId);
        if (!child) {
          diagnostics.push(err('unknown-def', `ไม่รู้จักชิ้นส่วน "${inst.defId}"`, `Unknown component "${inst.defId}"`, ipath));
          continue;
        }
        pinDefs = child.pins;
      }
      const map = new Map<string, number[]>();
      for (const p of pinDefs) map.set(p.name, alloc(p.width, `${ipath}.${p.name}`));
      const scope = path.slice(0, -1);
      let list = scopeNodes.get(scope);
      if (!list) scopeNodes.set(scope, (list = []));
      list.push({ id: inst.id, pins: map });
      const entry: InstEntry = { path: ipath, pins: map };
      if (inst.params) entry.params = inst.params;
      if (spec) entry.spec = spec;
      if (child) entry.child = child;
      insts.set(inst.id, entry);
    }

    const resolveRef = (ref: PinRef, wireId: string): number[] | undefined => {
      const wpath = `${path}${wireId}`;
      if (ref.inst === 'self') {
        const nodes = pinNodes.get(ref.pin);
        if (!nodes) diagnostics.push(err('unknown-pin', `วงจรนี้ไม่มี pin "${ref.pin}"`, `This circuit has no pin "${ref.pin}"`, wpath));
        return nodes;
      }
      const entry = insts.get(ref.inst);
      if (!entry) {
        diagnostics.push(err('unknown-instance', `สายต่อไปยังชิ้น "${ref.inst}" ที่ไม่มีอยู่`, `Wire refers to missing instance "${ref.inst}"`, wpath));
        return undefined;
      }
      const nodes = entry.pins.get(ref.pin);
      if (!nodes) {
        diagnostics.push(err('unknown-pin', `ชิ้น "${ref.inst}" ไม่มี pin "${ref.pin}"`, `Instance "${ref.inst}" has no pin "${ref.pin}"`, wpath));
      }
      return nodes;
    };

    for (const w of def.body.wires) {
      const a = resolveRef(w.from, w.id);
      const b = resolveRef(w.to, w.id);
      if (!a || !b) continue;
      if (a.length !== b.length) {
        diagnostics.push(
          err(
            'width-mismatch',
            `สาย ${w.id} ต่อ pin ที่กว้าง ${a.length} บิตกับ ${b.length} บิต`,
            `Wire ${w.id} connects ${a.length}-bit and ${b.length}-bit pins`,
            `${path}${w.id}`,
          ),
        );
        continue;
      }
      for (let i = 0; i < a.length; i++) uf.union(a[i] as number, b[i] as number);
    }

    for (const entry of insts.values()) {
      if (aborted) break;
      if (entry.spec) emitPrimitive(entry.spec, entry.pins, entry.path, entry.params);
      else if (entry.child) expand(entry.child, `${entry.path}/`, entry.pins, depth + 1, stack);
    }
    stack.pop();
  };

  expand(top, '', topPins, 0, []);

  // ---------- จัดเลข net ----------
  const nodeCount = uf.parent.length;
  const rootNet = new Int32Array(nodeCount).fill(-1);
  const netOf = new Int32Array(nodeCount);
  let netCount = 0;
  for (let n = 0; n < nodeCount; n++) {
    const r = uf.find(n);
    if (rootNet[r] === -1) rootNet[r] = netCount++;
    netOf[n] = rootNet[r] as number;
  }

  const gateCount = gA.length;
  const gateA = Int32Array.from(gA, (n) => netOf[n] as number);
  const gateB = Int32Array.from(gB, (n) => netOf[n] as number);
  const gateY = Int32Array.from(gY, (n) => netOf[n] as number);

  const netNames: string[][] = Array.from({ length: netCount }, () => []);
  for (let n = 0; n < nodeCount; n++) {
    const name = nodeName[n];
    const list = netNames[netOf[n] as number] as string[];
    if (name !== undefined && list.length < maxNames) list.push(name);
  }
  const label = (net: number): string => (netNames[net] as string[])[0] ?? `net${net}`;

  // ---------- ตรวจตัวขับ ----------
  const inputPins = top.pins.filter((p) => p.dir === 'in');
  const outputPins = top.pins.filter((p) => p.dir === 'out');
  const driverCount = new Int32Array(netCount);
  const driverLabels = new Map<number, string[]>();
  const addDriver = (net: number, what: string): void => {
    driverCount[net] = (driverCount[net] as number) + 1;
    let list = driverLabels.get(net);
    if (!list) driverLabels.set(net, (list = []));
    if (list.length < 4) list.push(what);
  };
  for (let g = 0; g < gateCount; g++) addDriver(gateY[g] as number, gPath[g] as string);
  constNodes.forEach((n) => addDriver(netOf[n] as number, nodeName[n] ?? 'const'));
  clockNodes.forEach((n) => addDriver(netOf[n] as number, nodeName[n] ?? 'clock'));
  for (const p of panelNodes) for (const n of p.nodes) addDriver(netOf[n] as number, p.path);
  for (const p of inputPins) {
    for (const n of topPins.get(p.name) ?? []) addDriver(netOf[n] as number, nodeName[n] ?? p.name);
  }

  let conflicts = 0;
  for (const [net, labels] of driverLabels) {
    if ((driverCount[net] as number) > 1 && ++conflicts <= MAX_REPORTS) {
      diagnostics.push(
        err(
          'multiple-drivers',
          `สาย ${label(net)} มีตัวขับมากกว่าหนึ่ง: ${labels.join(', ')}`,
          `Net ${label(net)} has more than one driver: ${labels.join(', ')}`,
          label(net),
          [net],
        ),
      );
    }
  }
  if (conflicts > MAX_REPORTS) {
    diagnostics.push(
      err(
        'multiple-drivers',
        `และยังมีสายที่มีตัวขับมากกว่าหนึ่งอีก ${conflicts - MAX_REPORTS} เส้น`,
        `and ${conflicts - MAX_REPORTS} more nets with multiple drivers`,
      ),
    );
  }

  // ---------- ตรวจ input ลอย ----------
  const isRead = new Uint8Array(netCount);
  for (let g = 0; g < gateCount; g++) {
    isRead[gateA[g] as number] = 1;
    isRead[gateB[g] as number] = 1;
  }
  for (const p of outputPins) for (const n of topPins.get(p.name) ?? []) isRead[netOf[n] as number] = 1;
  let floating = 0;
  for (let net = 0; net < netCount; net++) {
    if (isRead[net] && driverCount[net] === 0) {
      floating++;
      if (floating <= MAX_REPORTS) {
        diagnostics.push(
          warn('floating', `${label(net)} ไม่มีสัญญาณเข้า (ค่าเป็น X)`, `${label(net)} has no driver (value is X)`, label(net), [net]),
        );
      }
    }
  }
  if (floating > MAX_REPORTS) {
    diagnostics.push(
      warn(
        'floating',
        `และยังมีขาที่ไม่มีสัญญาณเข้าอีก ${floating - MAX_REPORTS} จุด`,
        `and ${floating - MAX_REPORTS} more undriven pins`,
      ),
    );
  }

  if (hasErrors(diagnostics)) return { netlist: null, diagnostics };

  // ---------- fanout แบบ CSR ----------
  const fanCount = new Int32Array(netCount);
  for (let g = 0; g < gateCount; g++) {
    const a = gateA[g] as number;
    const b = gateB[g] as number;
    fanCount[a] = (fanCount[a] as number) + 1;
    if (b !== a) fanCount[b] = (fanCount[b] as number) + 1;
  }
  const fanoutStart = new Int32Array(netCount + 1);
  for (let i = 0; i < netCount; i++) fanoutStart[i + 1] = (fanoutStart[i] as number) + (fanCount[i] as number);
  const fanoutGates = new Int32Array(fanoutStart[netCount] as number);
  const cursor = fanoutStart.slice(0, netCount);
  for (let g = 0; g < gateCount; g++) {
    const a = gateA[g] as number;
    const b = gateB[g] as number;
    fanoutGates[(cursor[a] as number)++] = g;
    if (b !== a) fanoutGates[(cursor[b] as number)++] = g;
  }
  const driverGate = new Int32Array(netCount).fill(-1);
  for (let g = 0; g < gateCount; g++) driverGate[gateY[g] as number] = g;

  const toNets = (p: PinDef): Int32Array => Int32Array.from(topPins.get(p.name) ?? [], (n) => netOf[n] as number);

  return {
    netlist: {
      topId,
      netCount,
      gateCount,
      gateA,
      gateB,
      gateY,
      gatePath: gPath,
      constNets: Int32Array.from(constNodes, (n) => netOf[n] as number),
      constValues: Uint8Array.from(constVals),
      clockNets: Int32Array.from(clockNodes, (n) => netOf[n] as number),
      panels: panelNodes.map((p) => ({
        path: p.path,
        words: p.words,
        width: p.width,
        nets: Int32Array.from(p.nodes, (n) => netOf[n] as number),
      })),
      inputs: new Map(inputPins.map((p) => [p.name, toNets(p)])),
      outputs: new Map(outputPins.map((p) => [p.name, toNets(p)])),
      scopes: scopeNodes,
      nodeNet: netOf,
      inputPins,
      outputPins,
      netNames,
      fanoutStart,
      fanoutGates,
      driverGate,
    },
    diagnostics,
  };
}

/** วงจรบนสุดเป็น primitive ก็ได้ (เช่นด่านทดลองเล่น NAND) จะห่อเป็นวงจรให้อัตโนมัติ */
function resolveTop(lib: ComponentLibrary, topId: string): ComponentDef | undefined {
  const spec = PRIMITIVES.get(topId);
  if (!spec) return lib.get(topId);
  let pins: PinDef[];
  try {
    pins = spec.pins();
  } catch {
    return undefined;
  }
  return {
    id: `wrap.${topId}`,
    name: spec.name,
    kind: 'circuit',
    pins,
    body: {
      instances: [{ id: 'p', defId: topId, x: 0, y: 0, rotation: 0 }],
      wires: pins.map((p, i) => ({ id: `w${i}`, from: { inst: 'self', pin: p.name }, to: { inst: 'p', pin: p.name } })),
    },
  };
}

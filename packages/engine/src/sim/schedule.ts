import type { Netlist } from '../flatten';

/**
 * ลำดับการคำนวณของ Fast Mode (Spec ส่วน 6.4)
 * เกตถูกแบ่งเป็นกลุ่มตาม SCC แล้วเรียงกลุ่มตาม topological order
 * กลุ่มที่มี loop (latch) ต้องวนคำนวณจนนิ่ง กลุ่มอื่นคำนวณครั้งเดียว
 */
export interface Schedule {
  /** เกตทั้งหมดเรียงตามลำดับที่ต้องคำนวณ */
  order: Int32Array;
  /** กลุ่ม i คือ order[groupStart[i] .. groupStart[i+1]) */
  groupStart: Int32Array;
  /** 1 ถ้ากลุ่มนั้นมี loop */
  groupLoop: Uint8Array;
  groupCount: number;
  loopGateCount: number;
}

export function buildSchedule(netlist: Netlist): Schedule {
  const n = netlist.gateCount;
  const comp = tarjan(netlist);
  const rpo = reversePostOrder(netlist);

  // Tarjan ให้เลขกลุ่มเรียงย้อน topological order จึงต้องกลับลำดับ
  let compCount = 0;
  for (let g = 0; g < n; g++) compCount = Math.max(compCount, (comp[g] as number) + 1);
  const compSize = new Int32Array(compCount);
  for (let g = 0; g < n; g++) compSize[comp[g] as number] = (compSize[comp[g] as number] as number) + 1;

  const gates = Array.from({ length: n }, (_, g) => g);
  // ในกลุ่มเดียวกันเรียงตาม reverse post-order เพื่อให้แต่ละรอบไหลผ่านทาง forward ได้ในครั้งเดียว
  gates.sort((a, b) => (comp[b] as number) - (comp[a] as number) || (rpo[a] as number) - (rpo[b] as number));

  const order = Int32Array.from(gates);
  const starts: number[] = [];
  const loops: number[] = [];
  let loopGateCount = 0;
  for (let i = 0; i < n; i++) {
    const g = order[i] as number;
    if (i === 0 || comp[g] !== comp[order[i - 1] as number]) {
      starts.push(i);
      const size = compSize[comp[g] as number] as number;
      const selfLoop = netlist.gateA[g] === netlist.gateY[g] || netlist.gateB[g] === netlist.gateY[g];
      const isLoop = size > 1 || selfLoop;
      loops.push(isLoop ? 1 : 0);
      if (isLoop) loopGateCount += size;
    }
  }
  starts.push(n);
  return {
    order,
    groupStart: Int32Array.from(starts),
    groupLoop: Uint8Array.from(loops),
    groupCount: loops.length,
    loopGateCount,
  };
}

/** Tarjan SCC แบบไม่ใช้ recursion (วงจรใหญ่ระดับหมื่นเกตจะ stack overflow ถ้าใช้ recursion) */
function tarjan(netlist: Netlist): Int32Array {
  const n = netlist.gateCount;
  const { gateY, fanoutStart, fanoutGates } = netlist;
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const comp = new Int32Array(n).fill(-1);
  const edgePtr = new Int32Array(n);
  const stack: number[] = [];
  const call: number[] = [];
  let counter = 0;
  let compCount = 0;

  const visit = (v: number): void => {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = 1;
    edgePtr[v] = fanoutStart[gateY[v] as number] as number;
    call.push(v);
  };

  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    visit(s);
    while (call.length > 0) {
      const v = call[call.length - 1] as number;
      const end = fanoutStart[(gateY[v] as number) + 1] as number;
      if ((edgePtr[v] as number) < end) {
        const w = fanoutGates[(edgePtr[v] as number)++] as number;
        if (index[w] === -1) visit(w);
        else if (onStack[w]) low[v] = Math.min(low[v] as number, index[w] as number);
        continue;
      }
      call.pop();
      if (call.length > 0) {
        const u = call[call.length - 1] as number;
        low[u] = Math.min(low[u] as number, low[v] as number);
      }
      if (low[v] === index[v]) {
        let w: number;
        do {
          w = stack.pop() as number;
          onStack[w] = 0;
          comp[w] = compCount;
        } while (w !== v);
        compCount++;
      }
    }
  }
  return comp;
}

/** reverse post-order ของทั้งกราฟ เริ่ม DFS จากเกตที่ไม่มีเกตอื่นขับเข้ามาก่อน */
function reversePostOrder(netlist: Netlist): Int32Array {
  const n = netlist.gateCount;
  const { gateA, gateB, gateY, fanoutStart, fanoutGates, driverGate } = netlist;
  const visited = new Uint8Array(n);
  const edgePtr = new Int32Array(n);
  const rpo = new Int32Array(n);
  let post = 0;
  const call: number[] = [];

  const dfs = (s: number): void => {
    visited[s] = 1;
    edgePtr[s] = fanoutStart[gateY[s] as number] as number;
    call.push(s);
    while (call.length > 0) {
      const v = call[call.length - 1] as number;
      const end = fanoutStart[(gateY[v] as number) + 1] as number;
      if ((edgePtr[v] as number) < end) {
        const w = fanoutGates[(edgePtr[v] as number)++] as number;
        if (!visited[w]) {
          visited[w] = 1;
          edgePtr[w] = fanoutStart[gateY[w] as number] as number;
          call.push(w);
        }
        continue;
      }
      call.pop();
      rpo[v] = n - 1 - post++;
    }
  };

  for (let g = 0; g < n; g++) {
    const fromGate = (driverGate[gateA[g] as number] as number) >= 0 || (driverGate[gateB[g] as number] as number) >= 0;
    if (!fromGate && !visited[g]) dfs(g);
  }
  for (let g = 0; g < n; g++) if (!visited[g]) dfs(g);
  return rpo;
}

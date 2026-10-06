import type { SimMode } from '@z-ncpu/shared';
import type { Netlist } from '../flatten';
import type { Simulator } from './base';
import { FastSimulator, type FastOptions } from './fast';
import { VisualSimulator, type VisualOptions } from './visual';

export function createSimulator(netlist: Netlist, mode: SimMode, options: VisualOptions & FastOptions = {}): Simulator {
  return mode === 'visual' ? new VisualSimulator(netlist, options) : new FastSimulator(netlist, options);
}

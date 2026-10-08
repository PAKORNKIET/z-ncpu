// @z-ncpu/canvas — editor, หน้าจอวงจร และการโต้ตอบ (Spec ส่วน 14)
// ไม่ใช้ React: app ห่อเองได้ และส่วนที่ไม่แตะ DOM ทดสอบได้ใน Node

export * from './geometry';
export * from './scene';
export { wireStyle } from './style';
export type { WireStyle } from './style';
export { Canvas2DRenderer, toBit } from './renderer2d';
export type { CircuitRenderer, Frame } from './renderer2d';
export { Interaction } from './interaction';
export type { InteractionOptions, KeyInput, Overlay, PlaceSpec, PointerInput } from './interaction';

export * from './editor/ops';
export { History } from './editor/history';
export type { HistoryEntry } from './editor/history';
export { Editor } from './editor/editor';
export type { Selection } from './editor/editor';
export { buildLayout3D, findNode, prefixCounts, GATE_PITCH, GATE_SIZE, LEVEL_H, SLAB_H } from './layout3d';
export type { Layout3D, Node3D } from './layout3d';

// undo/redo แบบเก็บสถานะ (Spec ส่วน 14)
// state เป็น immutable จึงเก็บทั้งก้อนได้โดยไม่เปลือง (ส่วนที่ไม่เปลี่ยนใช้ object เดิมร่วมกัน)

export interface HistoryEntry<T> {
  state: T;
  label: string;
}

export class History<T> {
  private past: HistoryEntry<T>[] = [];
  private future: HistoryEntry<T>[] = [];
  private lastMergeKey: string | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private current: T,
    private readonly limit = 200,
  ) {}

  get state(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** ชื่อของการกระทำที่จะ undo / redo ต่อไป (ใช้แสดงบนปุ่ม) */
  get undoLabel(): string | undefined {
    return this.past.at(-1)?.label;
  }

  get redoLabel(): string | undefined {
    return this.future.at(-1)?.label;
  }

  /**
   * บันทึกสถานะใหม่
   * mergeKey: การกระทำต่อเนื่องที่ใช้ key เดียวกัน (เช่นการลากครั้งเดียว) รวมเป็น undo ครั้งเดียว
   */
  push(next: T, label: string, mergeKey?: string): void {
    if (next === this.current) return;
    if (mergeKey !== undefined && mergeKey === this.lastMergeKey && this.past.length > 0) {
      this.current = next;
    } else {
      this.past.push({ state: this.current, label });
      if (this.past.length > this.limit) this.past.shift();
      this.current = next;
    }
    this.lastMergeKey = mergeKey;
    this.future = [];
    this.emit();
  }

  /** จบการกระทำต่อเนื่อง ครั้งถัดไปที่ใช้ key เดิมจะเป็น undo แยก */
  endMerge(): void {
    this.lastMergeKey = undefined;
  }

  undo(): boolean {
    const entry = this.past.pop();
    if (!entry) return false;
    this.future.push({ state: this.current, label: entry.label });
    this.current = entry.state;
    this.lastMergeKey = undefined;
    this.emit();
    return true;
  }

  redo(): boolean {
    const entry = this.future.pop();
    if (!entry) return false;
    this.past.push({ state: this.current, label: entry.label });
    this.current = entry.state;
    this.lastMergeKey = undefined;
    this.emit();
    return true;
  }

  /** แทนที่ทั้งหมด (เช่นเปิดด่านใหม่) ล้างประวัติ */
  reset(state: T): void {
    this.current = state;
    this.past = [];
    this.future = [];
    this.lastMergeKey = undefined;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

// มุมมอง 3D ของ CPU ที่ต่อเสร็จ (Spec M4): ซูมจากภาพรวมเข้าไปเห็นชั้น ALU, Register จนถึง NAND และเห็นไฟวิ่งตอนรัน
// โหลดแยกไฟล์ (lazy) เฉพาะตอนเปิด และคุยกับ engine ผ่าน message เท่านั้น ไม่แก้ engine
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { buildLayout3D, SLAB_H, type Layout3D } from '@z-ncpu/canvas';
import type { ComponentDef, WorkerToUi } from '@z-ncpu/shared';
import { ChevronRight, Focus, Maximize2 } from 'lucide-react';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EngineClient } from '../engine-client';
import { EngineClosedError } from '../engine-client';
import { partNamer } from './names';
import { readPalette, Scene3D } from './scene3d';

const FOV = 45;
const MAX_LABELS = 36;
/** ป้ายชื่อแสดงเมื่อแท่นกว้างบนจอระหว่างค่านี้ (px) และแม่ใหญ่เกินกว่าจะแสดงป้ายเอง */
const LABEL_MIN_PX = 70;
const LABEL_MAX_PX = 900;

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? (
      <p className="error small view3d-fallback">เปิดภาพ 3D ไม่ได้บนเครื่องนี้ (WebGL ใช้งานไม่ได้) ยังดูโครงสร้างจากรายการด้านข้างได้</p>
    ) : (
      this.props.children
    );
  }
}

interface FocusRequest {
  node: number;
  /** เพิ่มทุกครั้งที่ขอ จะได้ซูมซ้ำที่ชิ้นเดิมได้ */
  seq: number;
}

export default function View3D(props: { client: EngineClient; components: readonly ComponentDef[]; cpuDefId: string; root: string; version: string }) {
  const { client, root } = props;
  const [layout, setLayout] = useState<Layout3D | null>(null);
  const layoutRef = useRef<Layout3D | null>(null);
  const [selected, setSelected] = useState(0);
  const [focus, setFocus] = useState<FocusRequest>({ node: 0, seq: 0 });
  const [, setTick] = useState(0);
  const [webgl] = useState(hasWebGL);
  const invalidate = useRef<() => void>(() => {});
  const lastTick = useRef(0);
  const name = useMemo(() => partNamer(props.components, props.cpuDefId), [props.components, props.cpuDefId]);
  /** ค่าล่าสุดของ NAND (อาจมาถึงก่อนสร้างฉากเสร็จ) */
  const latest = useRef<Uint8Array | null>(null);
  const scene = useMemo(() => {
    if (!layout) return null;
    const s = new Scene3D(layout, readPalette());
    if (latest.current) s.update(latest.current);
    return s;
  }, [layout]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => () => scene?.dispose(), [scene]);

  // ขอผังของ NAND แล้วรับค่าของทุกตัวไปกับ signals (ขอผังใหม่ถ้าจำนวน NAND ไม่ตรง เช่น CPU เพิ่ง compile ใหม่)
  useEffect(() => {
    let active = true;
    let mapSize = -1;
    let asking = false;
    const ask = (): void => {
      if (asking) return;
      asking = true;
      client
        .send({ type: 'gateMap' })
        .then((res) => {
          asking = false;
          if (!active || res.type !== 'gateMap') return;
          mapSize = res.paths.length;
          if (mapSize === 0) return;
          if (latest.current?.length !== mapSize) latest.current = null;
          const next = buildLayout3D(res.paths, root);
          layoutRef.current = next;
          setLayout(next);
          setSelected(0);
          setFocus((f) => ({ node: 0, seq: f.seq + 1 }));
        })
        .catch((e: unknown) => {
          if (!(e instanceof EngineClosedError)) console.error(e);
        });
    };
    const off = client.subscribe((msg: WorkerToUi) => {
      if (msg.type !== 'signals' || !msg.gates) return;
      if (msg.gates.length !== mapSize) {
        ask();
        return;
      }
      latest.current = msg.gates;
      const s = sceneRef.current;
      if (!s || s.layout !== layoutRef.current) return;
      s.update(msg.gates);
      invalidate.current();
      const now = performance.now();
      if (now - lastTick.current > 200) {
        lastTick.current = now;
        setTick((t) => t + 1);
      }
    });
    ask();
    client.post({ type: 'watchGates', on: true });
    return () => {
      active = false;
      off();
      client.post({ type: 'watchGates', on: false });
    };
  }, [client, root, props.version]);

  // เปลี่ยนธีมแล้วระบายสีใหม่
  useEffect(() => {
    if (!scene) return;
    const obs = new MutationObserver(() => {
      scene.setPalette(readPalette());
      invalidate.current();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [scene]);

  useEffect(() => {
    scene?.select(selected);
    invalidate.current();
  }, [scene, selected]);

  const choose = (i: number, zoom: boolean): void => {
    setSelected(i);
    if (zoom) setFocus((f) => ({ node: i, seq: f.seq + 1 }));
  };

  const node = layout?.nodes[selected];
  const chain: number[] = [];
  for (let i = node ? selected : -1; i !== -1; i = layout!.nodes[i]!.parent) chain.unshift(i);
  const total = node ? node.end - node.start : 0;
  const children = node ? [...node.children].sort((a, b) => sizeOf(layout!, b) - sizeOf(layout!, a)) : [];

  return (
    <div className="view3d">
      <div className="view3d-stage">
        {!webgl ? (
          <p className="error small view3d-fallback">เครื่องนี้ไม่รองรับ WebGL จึงวาดภาพ 3D ไม่ได้ ยังดูโครงสร้างจากรายการด้านข้างได้</p>
        ) : scene && layout ? (
          <CanvasBoundary>
            <Canvas
              frameloop="demand"
              dpr={[1, 2]}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              camera={{ fov: FOV, near: 0.5, far: 50_000, position: [0, layout.width, layout.depthSize] }}
              onCreated={(state) => {
                invalidate.current = () => state.invalidate();
              }}
              aria-label={`ภาพ 3D ของ CPU: ${layout.gates.length.toLocaleString()} NAND`}
              role="img"
            >
              <hemisphereLight args={['#ffffff', '#445066', 1.1]} />
              <directionalLight position={[1, 2.2, 1.4]} intensity={1.2} />
              <primitive object={scene.group} />
              <Rig scene={scene} focus={focus} name={name} onPick={(i, zoom) => (i >= 0 ? choose(i, zoom) : undefined)} />
            </Canvas>
          </CanvasBoundary>
        ) : (
          <p className="muted small view3d-fallback">กำลังจัดวาง NAND…</p>
        )}
        {scene && layout && webgl ? (
          <div className="view3d-tools">
            <button onClick={() => choose(0, true)} aria-label="ดูภาพรวมทั้ง CPU" title="ภาพรวม">
              <Maximize2 size={16} aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      <aside className="view3d-side" aria-label="ชิ้นส่วนใน CPU">
        {layout && node ? (
          <>
            <nav aria-label="ตำแหน่งในลำดับชั้น" className="crumbs small">
              {chain.map((i, k) => (
                <span key={i}>
                  {k > 0 ? <ChevronRight size={12} aria-hidden /> : null}
                  <button className="linklike" onClick={() => choose(i, true)} aria-current={i === selected ? 'true' : undefined}>
                    {name(layout.nodes[i]!.path).name}
                  </button>
                </span>
              ))}
            </nav>
            <h3 data-testid="view3d-selected">{name(node.path).name}</h3>
            <p className="small muted" data-testid="view3d-stats">
              {node.id ? <span className="mono">{node.id}</span> : null}
              {node.id ? ' · ' : ''}
              NAND {total.toLocaleString()} ตัว
              {scene?.hasValues ? (
                <>
                  {' '}
                  · เป็น 1 อยู่ <span data-testid="view3d-high">{scene.high(selected).toLocaleString()}</span> · เพิ่งเปลี่ยนค่า{' '}
                  <span data-testid="view3d-changed">{scene.changed(selected).toLocaleString()}</span>
                </>
              ) : null}
            </p>
            <button onClick={() => choose(selected, true)}>
              <Focus size={16} aria-hidden /> ซูมไปที่ชิ้นนี้
            </button>
            {children.length > 0 ? (
              <>
                <h4 className="small">ข้างในมี {children.length} ชิ้น</h4>
                <ul className="view3d-parts" aria-label="ชิ้นส่วนข้างใน">
                  {children.slice(0, 60).map((c) => {
                    const n = layout.nodes[c]!;
                    const count = n.end - n.start;
                    const act = scene && count > 0 ? scene.changed(c) / count : 0;
                    return (
                      <li key={c}>
                        <button className="part" onClick={() => choose(c, true)}>
                          <span className="part-name">{name(n.path).name}</span>
                          <span className="small muted mono">{count.toLocaleString()}</span>
                          <span className="part-meter" aria-hidden>
                            <span style={{ width: `${Math.round(Math.min(1, act * 8) * 100)}%` }} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {children.length > 60 ? <p className="small muted">และอีก {children.length - 60} ชิ้น</p> : null}
              </>
            ) : (
              <p className="small muted">ชิ้นนี้ต่อจาก NAND โดยตรง</p>
            )}
          </>
        ) : (
          <p className="small muted">กำลังโหลดโครงสร้างของ CPU…</p>
        )}
        <p className="small muted view3d-help">
          ลากเพื่อหมุน · คลิกขวาหรือสองนิ้วลากเพื่อเลื่อน · ล้อเมาส์หรือหนีบเพื่อซูม · คลิกเลือกชิ้น ดับเบิลคลิกเพื่อซูมเข้าไป
        </p>
        <p className="small view3d-legend">
          <span className="sw high" aria-hidden /> เป็น 1 <span className="sw low" aria-hidden /> เป็น 0 <span className="sw flash" aria-hidden /> เพิ่งเปลี่ยนค่า (ไฟวิ่ง)
        </p>
      </aside>
    </div>
  );
}

const sizeOf = (l: Layout3D, i: number): number => l.nodes[i]!.end - l.nodes[i]!.start;

/** กล้อง การหมุนซูม การคลิกเลือก ลดรายละเอียดตามระยะ และป้ายชื่อ */
function Rig(props: { scene: Scene3D; focus: FocusRequest; name: (path: string) => { name: string }; onPick: (node: number, zoom: boolean) => void }) {
  const { scene, focus } = props;
  const { camera, gl, invalidate, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const [controls, setControls] = useState<OrbitControls | null>(null);
  const tween = useRef<{ fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3; t0: number } | null>(null);
  const labels = useRef<HTMLDivElement | null>(null);
  const onPick = useRef(props.onPick);
  onPick.current = props.onPick;
  const nameRef = useRef(props.name);
  nameRef.current = props.name;

  // ตั้งค่าการหมุนซูม (สร้างใน effect: StrictMode จะ mount ซ้ำแล้วได้ตัวใหม่ที่ยังใช้ได้)
  useEffect(() => {
    const controls = new OrbitControls(cam, gl.domElement);
    const l = scene.layout;
    const span = Math.max(l.width, l.depthSize);
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 1.5;
    controls.maxDistance = span * 3;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = false;
    const change = (): void => invalidate();
    controls.addEventListener('change', change);
    setControls(controls);
    return () => {
      controls.removeEventListener('change', change);
      controls.dispose();
      setControls(null);
    };
  }, [cam, gl, scene, invalidate]);

  // ป้ายชื่อเป็น HTML ซ้อนบน canvas (อ่านง่ายกว่าตัวหนังสือใน 3D) โปรแกรมอ่านหน้าจอใช้รายการด้านข้างแทน
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const box = document.createElement('div');
    box.className = 'view3d-labels';
    box.setAttribute('aria-hidden', 'true');
    parent.appendChild(box);
    labels.current = box;
    return () => {
      box.remove();
      labels.current = null;
    };
  }, [gl]);

  // คลิก = เลือกชิ้น (ถ้าไม่ได้ลาก) ดับเบิลคลิก = ซูมเข้าไป
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const ray = new THREE.Raycaster();
    const at = (e: MouseEvent): number => {
      const r = el.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
      return scene.pick(ray);
    };
    const pd = (e: PointerEvent): void => {
      down = { x: e.clientX, y: e.clientY };
    };
    let lastTap: { t: number; x: number; y: number } | null = null;
    const pu = (e: PointerEvent): void => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
        const i = at(e);
        // จอสัมผัส: แตะสองครั้งติดกัน = ดับเบิลคลิก (Safari บน iOS ไม่ส่ง dblclick ให้ canvas)
        const now = performance.now();
        const twice = e.pointerType === 'touch' && lastTap !== null && now - lastTap.t < 350 && Math.hypot(lastTap.x - e.clientX, lastTap.y - e.clientY) < 24;
        lastTap = twice ? null : { t: now, x: e.clientX, y: e.clientY };
        if (i >= 0) onPick.current(i, twice);
      }
      down = null;
    };
    const noCallout = (e: TouchEvent): void => {
      if (e.cancelable) e.preventDefault();
    };
    const dbl = (e: MouseEvent): void => {
      const i = at(e);
      if (i >= 0) onPick.current(i, true);
    };
    el.addEventListener('pointerdown', pd);
    el.addEventListener('pointerup', pu);
    el.addEventListener('dblclick', dbl);
    el.addEventListener('touchstart', noCallout, { passive: false });
    return () => {
      el.removeEventListener('touchstart', noCallout);
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointerup', pu);
      el.removeEventListener('dblclick', dbl);
    };
  }, [gl, cam, scene]);

  // ซูมไปที่ชิ้นที่ขอ (เลื่อนกล้องนุ่มๆ 0.35 วินาที) ครั้งแรกวางกล้องทันที
  useEffect(() => {
    const n = scene.layout.nodes[focus.node];
    if (!n || !controls) return;
    const target = new THREE.Vector3(n.x + n.w / 2, n.y + SLAB_H, n.z + n.d / 2);
    const span = Math.max(n.w, n.d, 4);
    const dist = (span * 0.5) / Math.tan(((FOV / 2) * Math.PI) / 180) + 2;
    const dir = cam.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6 || focus.seq <= 1) dir.set(0, 1, 1.2);
    dir.normalize();
    if (dir.y < 0.35) dir.setY(0.35).normalize();
    const toPos = target.clone().addScaledVector(dir, dist);
    if (focus.seq <= 1) {
      cam.position.copy(toPos);
      controls.target.copy(target);
      controls.update();
    } else {
      tween.current = { fromPos: cam.position.clone(), fromTarget: controls.target.clone(), toPos, toTarget: target, t0: performance.now() };
    }
    invalidate();
  }, [focus, scene, cam, controls, invalidate]);

  useFrame(() => {
    if (!controls) return;
    const tw = tween.current;
    if (tw) {
      const t = Math.min(1, (performance.now() - tw.t0) / 350);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      cam.position.lerpVectors(tw.fromPos, tw.toPos, e);
      controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
      controls.update();
      if (t < 1) invalidate();
      else tween.current = null;
    }

    // ระยะถึงจุดที่มอง → ขนาดบนจอ ใช้ทั้งลดรายละเอียดและเลือกป้ายชื่อ
    const dist = Math.max(0.01, cam.position.distanceTo(controls.target));
    const pxPerUnit = size.height / (2 * dist * Math.tan(((cam.fov / 2) * Math.PI) / 180));
    cam.near = Math.max(0.05, dist / 200);
    cam.far = dist * 40 + Math.max(scene.layout.width, scene.layout.depthSize) * 2;
    cam.updateProjectionMatrix();
    // ป้ายชื่อต้องใช้ตำแหน่งกล้องของเฟรมนี้ (ปกติ renderer อัปเดตให้ตอนวาด ซึ่งมาหลัง useFrame)
    cam.updateMatrixWorld();
    scene.lod(pxPerUnit);
    drawLabels(pxPerUnit);
  });

  function drawLabels(pxPerUnit: number): void {
    const box = labels.current;
    if (!box) return;
    const { nodes } = scene.layout;
    const px = (i: number): number => Math.max(nodes[i]!.w, nodes[i]!.d) * pxPerUnit;
    const picks: { i: number; s: number }[] = [];
    for (let i = 1; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.depth > scene.visibleDepth) continue;
      const s = px(i);
      if (s < LABEL_MIN_PX || s > LABEL_MAX_PX) continue;
      if (n.parent !== 0 && px(n.parent) <= LABEL_MAX_PX) continue;
      picks.push({ i, s });
    }
    picks.sort((a, b) => b.s - a.s);
    const v = new THREE.Vector3();
    let used = 0;
    for (const { i } of picks) {
      if (used >= MAX_LABELS) break;
      const n = nodes[i]!;
      v.set(n.x + n.w / 2, n.y + SLAB_H, n.z + n.d / 2).project(cam);
      if (v.z > 1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) continue;
      let el = box.children[used] as HTMLDivElement | undefined;
      if (!el) {
        el = document.createElement('div');
        el.className = 'view3d-label';
        box.appendChild(el);
      }
      const text = nameRef.current(n.path).name;
      if (el.textContent !== text) el.textContent = text;
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
      el.style.display = '';
      used++;
    }
    for (let k = used; k < box.children.length; k++) (box.children[k] as HTMLElement).style.display = 'none';
  }

  return null;
}

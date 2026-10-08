// PWA: ลงทะเบียน service worker (เฉพาะเว็บที่ build แล้ว ไม่ใช่ตอน dev และไม่ใช่ในแอป Windows ของ Tauri)
// แจ้ง UI เมื่อมีเวอร์ชันใหม่รออยู่ และเมื่อเบราว์เซอร์พร้อมให้ติดตั้งเป็นแอป

export interface PwaState {
  /** มีเวอร์ชันใหม่ดาวน์โหลดไว้แล้ว รอให้ผู้เล่นกดอัปเดต */
  updateReady: boolean;
  /** เก็บไฟล์ไว้ครบ ใช้ออฟไลน์ได้ (ครั้งแรกที่ติดตั้ง service worker) */
  offlineReady: boolean;
  /** เบราว์เซอร์ให้ติดตั้งเป็นแอปได้ (Chrome/Edge/Android) */
  canInstall: boolean;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let state: PwaState = { updateReady: false, offlineReady: false, canInstall: false };
const listeners = new Set<() => void>();
let waiting: ServiceWorker | null = null;
let installEvent: InstallPromptEvent | null = null;

const set = (patch: Partial<PwaState>): void => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

export const pwaState = (): PwaState => state;
export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** อยู่ในแอป Windows (Tauri) หรือไม่ */
export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window || location.hostname === 'tauri.localhost' || location.protocol === 'tauri:';

/** โหลดเวอร์ชันใหม่ (ความคืบหน้าถูกบันทึกตอนปิดหน้าอยู่แล้ว) */
export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export async function installApp(): Promise<void> {
  if (!installEvent) return;
  await installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  set({ canInstall: false });
}

export function startPwa(): void {
  if (isTauri()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => set({ canInstall: false }));
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        const watch = (sw: ServiceWorker | null): void => {
          sw?.addEventListener('statechange', () => {
            if (sw.state !== 'installed') return;
            if (hadController || navigator.serviceWorker.controller) {
              waiting = reg.waiting ?? sw;
              set({ updateReady: true });
            } else {
              set({ offlineReady: true });
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting;
          set({ updateReady: true });
        }
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
        // เปิดค้างไว้นานๆ ก็ยังรู้ว่ามีเวอร์ชันใหม่ (ตรวจทุกชั่วโมง)
        setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch((e: unknown) => console.warn('ลงทะเบียน service worker ไม่ได้', e));
  });
}

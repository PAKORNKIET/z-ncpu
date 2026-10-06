// รวมข้อความ license ของ dependency ทุกตัวที่ติดไปกับแอป ไว้ในไฟล์ third-party-licenses.txt
// เพราะ license แบบ MIT/BSD/Apache กำหนดให้แจกข้อความ license ไปพร้อมซอฟต์แวร์ แต่ตอน build ตัว minifier ลบคอมเมนต์ทิ้ง

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

interface PkgInfo {
  name: string;
  version: string;
  license: string;
  text: string;
}

/** หาโฟลเดอร์ของ package โดยไล่หา node_modules ขึ้นไปทีละชั้น (ไม่ผ่าน exports ของ package) */
function packageDir(name: string, fromDir: string): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function collect(rootDir: string): PkgInfo[] {
  const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const seen = new Map<string, PkgInfo>();
  const queue: [string, string][] = Object.keys(rootPkg.dependencies ?? {}).map((n) => [n, rootDir]);
  while (queue.length > 0) {
    const [name, from] = queue.shift() as [string, string];
    const dir = packageDir(name, from);
    if (!dir) throw new Error(`หา package ${name} ไม่เจอ`);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
      license?: string;
      private?: boolean;
      dependencies?: Record<string, string>;
    };
    if (seen.has(pkg.name)) continue;
    const deps = Object.keys(pkg.dependencies ?? {});
    queue.push(...deps.map((d): [string, string] => [d, dir]));
    // package ใน workspace ของเราเอง (private) อยู่ภายใต้ license ของโปรเจกต์อยู่แล้ว
    if (pkg.private) continue;
    const file = readdirSync(dir).find((f) => /^(license|licence|copying)(\..*)?$/i.test(f));
    if (!file) throw new Error(`package ${pkg.name} ไม่มีไฟล์ LICENSE ต้องตรวจเองก่อนแจกแอป`);
    seen.set(pkg.name, {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? 'UNKNOWN',
      text: readFileSync(join(dir, file), 'utf8').trim(),
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** license ที่อนุญาตให้ติดไปกับแอปได้โดยไม่ต้องเปลี่ยน license ของโปรเจกต์ */
const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Apache-2.0 OR MIT', 'MIT OR Apache-2.0']);

export function thirdPartyLicenses(rootDir: string): Plugin {
  return {
    name: 'z-ncpu-third-party-licenses',
    apply: 'build',
    generateBundle() {
      const pkgs = collect(rootDir);
      const bad = pkgs.filter((p) => !ALLOWED.has(p.license));
      if (bad.length > 0) {
        this.error(`dependency ที่ license ยังไม่ได้ตรวจ: ${bad.map((p) => `${p.name} (${p.license})`).join(', ')}`);
      }
      const header =
        'Z-NCPU ใช้ซอฟต์แวร์ต่อไปนี้ภายใต้ license ของแต่ละตัว\n' +
        'Z-NCPU includes the following third-party software under their own licenses.\n';
      const body = pkgs.map((p) => `${'='.repeat(72)}\n${p.name}@${p.version} — ${p.license}\n${'='.repeat(72)}\n\n${p.text}\n`);
      this.emitFile({ type: 'asset', fileName: 'third-party-licenses.txt', source: [header, ...body].join('\n') });
    },
  };
}


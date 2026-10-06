import type { Diagnostic, DiagnosticCode } from '@z-ncpu/shared';

/** ข้อความ diagnostic ทุกอันมีทั้งไทยและอังกฤษ (Rule 9: ภาษาไทยก่อน) */
export function err(code: DiagnosticCode, th: string, en: string, path?: string, nets?: number[]): Diagnostic {
  return withExtras({ code, severity: 'error', message: { th, en } }, path, nets);
}

export function warn(code: DiagnosticCode, th: string, en: string, path?: string, nets?: number[]): Diagnostic {
  return withExtras({ code, severity: 'warning', message: { th, en } }, path, nets);
}

function withExtras(d: Diagnostic, path?: string, nets?: number[]): Diagnostic {
  if (path !== undefined) d.path = path;
  if (nets !== undefined) d.nets = nets;
  return d;
}

export const hasErrors = (diags: readonly Diagnostic[]): boolean => diags.some((d) => d.severity === 'error');

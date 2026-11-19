import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** Recorre archivos de un directorio ignorando carpetas pesadas o generadas. */
export function* walk(dir: string, ignore = IGNORED_DIRS): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, ignore);
    else yield full;
  }
}

export const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.output',
  '.svelte-kit', '.angular', 'android', 'ios', 'release', 'coverage',
]);

/** Plantillas que se publican junto al paquete (../../templates desde dist/utils). */
export function templatePath(...parts: string[]): string {
  return path.join(fileURLToPath(new URL('../../templates', import.meta.url)), ...parts);
}

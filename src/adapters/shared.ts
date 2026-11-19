import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../types.js';
import { installCommand } from '../project.js';
import { run, q } from '../utils/exec.js';
import { cleanDir, IGNORED_DIRS, readJson, walk } from '../utils/fs.js';

export function installDeps(project: Project): Promise<string> {
  return run(installCommand(project.packageManager), project.root);
}

/**
 * Comando para ejecutar el binario de una dependencia con node, leyendo su
 * campo "bin". Evita los .cmd de Windows y no depende de los scripts del usuario.
 */
export function binCommand(project: Project, pkgName: string, binName = pkgName): string {
  const pkgDir = path.join(project.root, 'node_modules', pkgName);
  const { bin } = readJson<{ bin?: string | Record<string, string> }>(path.join(pkgDir, 'package.json'));
  const rel = typeof bin === 'string' ? bin : bin?.[binName] ?? Object.values(bin ?? {})[0];
  if (!rel) throw new Error(`La dependencia ${pkgName} no tiene un ejecutable.`);
  return `node ${q(path.join(pkgDir, rel))}`;
}

export function copyOutput(src: string, outDir: string): string {
  if (!fs.existsSync(path.join(src, 'index.html'))) {
    throw new Error(`La compilación no generó ${path.join(src, 'index.html')}.`);
  }
  cleanDir(outDir);
  fs.cpSync(src, outDir, { recursive: true, dereference: true });
  return outDir;
}

/** Archivos del proyecto (rutas relativas con "/") que cumplen el patrón. */
export function findFiles(root: string, pattern: RegExp, ignore = IGNORED_DIRS): string[] {
  const result: string[] = [];
  for (const file of walk(root, ignore)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (pattern.test(rel)) result.push(rel);
  }
  return result;
}

export function readText(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** "a, b, c y 3 más" — para listar archivos sin abrumar. */
export function listFew(items: string[], max = 3): string {
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} y ${items.length - max} más` : shown;
}

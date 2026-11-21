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

/** Agrega dependencias de desarrollo a la copia de trabajo (nunca al proyecto original). */
export function addDevDeps(project: Project, pkgs: string[]): Promise<string> {
  const list = pkgs.join(' ');
  const cmd = {
    npm: `npm install --no-audit --no-fund --save-dev ${list}`,
    pnpm: `pnpm add -D ${list}`,
    yarn: `yarn add -D ${list}`,
    bun: `bun add -d ${list}`,
  }[project.packageManager];
  return run(cmd, project.root);
}

/**
 * Renombra la configuración del usuario a "<nombre>.original.<ext>" y escribe en
 * su lugar una que la importa. En el código generado, `__original(...args)`
 * devuelve la configuración original ya resuelta como objeto, aunque fuera una
 * función o una promesa. Así no hace falta entender la forma del archivo.
 */
export function wrapConfig(project: Project, candidates: string[], fallbackName: string, body: string): void {
  const current = candidates.find((f) => fs.existsSync(path.join(project.root, f)));
  let header = 'const __original = async () => ({});';
  let target = fallbackName;
  if (current) {
    const ext = path.extname(current);
    const stem = current.slice(0, -ext.length);
    fs.renameSync(path.join(project.root, current), path.join(project.root, `${stem}.original${ext}`));
    target = current;
    // TypeScript resuelve el import sin extensión; en JS hay que ponerla.
    const spec = ext === '.ts' || ext === '.mts' ? `./${stem}.original` : `./${stem}.original${ext}`;
    header = [
      `import __config from '${spec}';`,
      'const __original = async (...args) =>',
      "  ((typeof __config === 'function' ? await __config(...args) : await __config) ?? {});",
    ].join('\n');
  }
  const banner = '// @ts-nocheck\n// Generado por todo2todo: versión estática para empaquetar como app.';
  fs.writeFileSync(path.join(project.root, target), `${banner}\n${header}\n\n${body}`);
}

/**
 * Para rutas que no se generaron, Electron y Android sirven 200.html si existe.
 * En sitios multipágina sin router de cliente, la mejor opción es su 404.
 */
export function ensureFallback(outDir: string, candidates: string[]): void {
  const dest = path.join(outDir, '200.html');
  if (fs.existsSync(dest)) return;
  const src = candidates.map((c) => path.join(outDir, c)).find((f) => fs.existsSync(f));
  if (src) fs.copyFileSync(src, dest);
}

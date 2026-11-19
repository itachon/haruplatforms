import fs from 'node:fs';
import path from 'node:path';
import type { Finding, PackageJson, PackageManager, Project } from './types.js';
import { readJson, walk } from './utils/fs.js';

export function loadProject(root: string): Project {
  const abs = path.resolve(root);
  const pkgFile = path.join(abs, 'package.json');
  if (!fs.existsSync(pkgFile)) {
    throw new Error(`No se encontró package.json en ${abs}. ¿Es la carpeta correcta del proyecto?`);
  }
  return { root: abs, pkg: readJson<PackageJson>(pkgFile), packageManager: detectPackageManager(abs) };
}

function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

export function hasDep(project: Project, name: string): boolean {
  const { dependencies = {}, devDependencies = {} } = project.pkg;
  return name in dependencies || name in devDependencies;
}

export function depVersion(project: Project, name: string): string | undefined {
  const { dependencies = {}, devDependencies = {} } = project.pkg;
  return dependencies[name] ?? devDependencies[name];
}

export function majorOf(range: string | undefined): string {
  return range?.match(/\d+/)?.[0] ?? '';
}

export function installCommand(pm: PackageManager): string {
  return pm === 'npm' ? 'npm install --no-audit --no-fund' : `${pm} install`;
}

const SOURCE_EXT = /\.(m?[jt]sx?|vue|svelte|astro|html)$/;
/** Código que corre en el servidor o al compilar, nunca dentro de la app. */
const SERVER_ONLY = /(^|[\\/])(server\.[cm]?[jt]s|[\w.-]+\.config\.[cm]?[jt]s|server[\\/].*|middleware\.[cm]?[jt]s)$/;
const LOCAL_URL = /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?[^\s'"`)]*/g;

/** Revisiones que aplican a cualquier framework. */
export function commonFindings(project: Project): Finding[] {
  const findings: Finding[] = [];
  const localUrls = new Map<string, string>();

  for (const file of walk(project.root)) {
    const name = path.basename(file);
    if (!SOURCE_EXT.test(name) && !name.startsWith('.env')) continue;
    if (SERVER_ONLY.test(path.relative(project.root, file))) continue;
    if (fs.statSync(file).size > 1_000_000) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(LOCAL_URL)) {
      if (!localUrls.has(match[0])) localUrls.set(match[0], path.relative(project.root, file));
    }
  }

  for (const [url, file] of localUrls) {
    findings.push({
      level: 'warn',
      message: `Tu app se conecta a ${url} (en ${file}).`,
      hint: 'Esa dirección solo existe en tu computadora. En el celular o en otra PC no va a funcionar: usa la URL pública de tu servidor.',
    });
  }
  return findings;
}

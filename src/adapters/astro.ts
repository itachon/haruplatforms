import fs from 'node:fs';
import path from 'node:path';
import type { Adapter, Finding, Project } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { run } from '../utils/exec.js';
import { binCommand, copyOutput, ensureFallback, findFiles, installDeps, listFew, readText, wrapConfig } from './shared.js';

const CONFIG_FILES = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts', 'astro.config.cjs'];
const PAGE = /^src\/pages\/.+\.(astro|md|mdx|html|m?[jt]s)$/;
const NOT_PRERENDERED = /export\s+const\s+prerender\s*=\s*false/;

function configText(project: Project): string {
  const file = CONFIG_FILES.find((f) => fs.existsSync(path.join(project.root, f)));
  return file ? readText(project.root, file) : '';
}

/** Con output "server", las páginas sin "prerender" explícito se generan en cada visita. */
const isServerOutput = (project: Project) => /output\s*:\s*['"]server['"]/.test(configText(project));

function analyzeAstro(project: Project): Finding[] {
  const findings: Finding[] = [
    { level: 'info', message: 'Se generará la versión estática de tu sitio (output: "static").' },
  ];
  const pages = findFiles(project.root, PAGE);
  const serverPages = pages.filter((f) => NOT_PRERENDERED.test(readText(project.root, f)));
  if (serverPages.length) {
    findings.push({
      level: 'warn',
      message: `Hay páginas o endpoints que se generan en el servidor en cada visita (${listFew(serverPages)}).`,
      hint: 'Se quitarán de la app. Publica tu proyecto en un servidor y haz que la app llame a esa URL.',
    });
  }

  if (isServerOutput(project)) {
    findings.push({
      level: 'warn',
      message: 'Tu proyecto está configurado para correr en un servidor (output: "server").',
      hint: 'Las páginas sin "prerender = false" se generarán al compilar. Si alguna lee cookies, cabeceras o parámetros de la URL, mostrará los valores del momento de compilar.',
    });
  }

  // En sitios estáticos, una ruta [param] necesita la lista de páginas a generar.
  const dynamic = pages
    .filter((f) => /\[[^\]]+\]/.test(f) && /\.(astro|md|mdx)$/.test(f))
    .filter((f) => !serverPages.includes(f) && !/getStaticPaths/.test(readText(project.root, f)));
  if (dynamic.length) {
    findings.push({
      level: 'error',
      message: `Hay rutas dinámicas sin lista de páginas (${listFew(dynamic)}).`,
      hint: 'Agrega getStaticPaths() para indicar qué páginas generar.',
    });
  }

  const islands = findFiles(project.root, /^src\/.+\.astro$/).filter((f) => /server:defer/.test(readText(project.root, f)));
  if (islands.length) {
    findings.push({
      level: 'error',
      message: `Tu proyecto usa server islands (server:defer en ${listFew(islands)}).`,
      hint: 'Se generan en un servidor en cada visita. Quita server:defer o carga ese contenido desde el navegador.',
    });
  }

  if (findFiles(project.root, /^src\/actions\/index\.[jt]s$/).length) {
    findings.push({
      level: 'warn',
      message: 'Tu proyecto define Astro Actions (src/actions).',
      hint: 'Corren en un servidor: dentro de la app las llamadas a actions fallarán.',
    });
  }
  return findings;
}

/** Quita de la copia lo que solo puede correr en un servidor y haría fallar la compilación estática. */
function stripServerOnly(project: Project): void {
  for (const f of findFiles(project.root, PAGE)) {
    if (NOT_PRERENDERED.test(readText(project.root, f))) fs.rmSync(path.join(project.root, f));
  }
}

export const astroAdapter: Adapter = {
  id: 'astro',

  detect: (project) => hasDep(project, 'astro'),

  describe: (project) => `Astro ${majorOf(depVersion(project, 'astro'))}`,

  analyze: analyzeAstro,

  async build(project, outDir) {
    await installDeps(project);
    stripServerOnly(project);
    wrapConfig(
      project,
      CONFIG_FILES,
      'astro.config.mjs',
      `const { adapter, ...base } = await __original();

export default {
  ...base,
  // Sin adaptador de servidor: todo se genera al compilar.
  output: 'static',
  // La app se sirve desde la raíz, aunque el sitio se publique en un subdirectorio.
  base: '/',
  build: { ...base.build, assetsPrefix: undefined },
};
`,
    );
    await run(`${binCommand(project, 'astro')} build --outDir .todo2todo-build`, project.root, {
      ASTRO_TELEMETRY_DISABLED: '1',
    });
    copyOutput(path.join(project.root, '.todo2todo-build'), outDir);
    ensureFallback(outDir, ['404.html', '404/index.html']);
    return outDir;
  },
};

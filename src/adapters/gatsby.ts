import fs from 'node:fs';
import path from 'node:path';
import type { Adapter, Finding, Project } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { run } from '../utils/exec.js';
import { readJson, writeJson } from '../utils/fs.js';
import { binCommand, copyOutput, ensureFallback, findFiles, installDeps, listFew, readText } from './shared.js';

const CODE = /^(src\/.+|gatsby-node)\.(m?[jt]sx?)$/;

function analyzeGatsby(project: Project): Finding[] {
  const findings: Finding[] = [
    {
      level: 'info',
      message: 'Se usará el sitio que genera gatsby build.',
      hint: 'Los datos de GraphQL quedan guardados en la app tal como estaban al compilar.',
    },
  ];
  const code = findFiles(project.root, CODE);

  const ssr = code.filter((f) => /getServerData/.test(readText(project.root, f)));
  if (ssr.length) {
    findings.push({
      level: 'error',
      message: `Hay páginas que se generan en el servidor en cada visita (getServerData en ${listFew(ssr)}).`,
      hint: 'Quita getServerData y carga esos datos desde el navegador con fetch.',
    });
  }

  const dsg = code.filter((f) => /\bdefer\s*:\s*true|export\s+(async\s+)?function\s+config\b/.test(readText(project.root, f)));
  if (dsg.length) {
    findings.push({
      level: 'warn',
      message: `Hay páginas generadas bajo demanda (DSG, en ${listFew(dsg)}).`,
      hint: 'Esas páginas se generan en el hosting la primera vez que alguien las visita y no estarán dentro de la app.',
    });
  }

  const functions = findFiles(project.root, /^src\/api\/.+\.(m?[jt]s)$/);
  if (functions.length) {
    findings.push({
      level: 'warn',
      message: `Tu proyecto tiene Gatsby Functions (${listFew(functions)}).`,
      hint: 'No se incluirán en la app. Publica tu proyecto en un servidor y haz que la app llame a esa URL.',
    });
  }
  return findings;
}

/** "/productos/:id" → expresión regular para la ruta de la URL. */
function matchPathToRegex(matchPath: string): string {
  const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const body = matchPath
    .replace(/\/$/, '')
    .split('/')
    .map((seg) => (seg === '*' || seg.startsWith('*') ? '.*' : seg.startsWith(':') ? '[^/]+' : escape(seg)))
    .join('/');
  return `^${body}/?$`;
}

/**
 * Las rutas de solo cliente (p.ej. src/pages/productos/[id].js) tienen una
 * página generada propia. Electron y Android la sirven para cualquier URL que
 * coincida, en lugar de la página 404, para que React no tenga que rehacerla.
 */
function writeClientRoutes(project: Project, outDir: string): void {
  const file = path.join(project.root, '.cache', 'match-paths.json');
  if (!fs.existsSync(file)) return;
  const routes = readJson<{ path: string; matchPath: string }[]>(file)
    .map((r) => ({ pattern: matchPathToRegex(r.matchPath), file: `${r.path.replace(/^\//, '')}index.html` }))
    .filter((r) => fs.existsSync(path.join(outDir, r.file)));
  if (routes.length) writeJson(path.join(outDir, 'todo2todo-routes.json'), routes);
}

export const gatsbyAdapter: Adapter = {
  id: 'gatsby',

  detect: (project) => hasDep(project, 'gatsby'),

  describe: (project) => `Gatsby ${majorOf(depVersion(project, 'gatsby'))}`,

  analyze: analyzeGatsby,

  async build(project, outDir) {
    await installDeps(project);
    // Restos de una compilación anterior del usuario (rutas absolutas de su equipo).
    for (const dir of ['.cache', 'public']) fs.rmSync(path.join(project.root, dir), { recursive: true, force: true });
    // Sin --prefix-paths, Gatsby ignora pathPrefix y assetPrefix: la app se sirve desde la raíz.
    await run(`${binCommand(project, 'gatsby')} build`, project.root, { GATSBY_TELEMETRY_DISABLED: '1' });
    copyOutput(path.join(project.root, 'public'), outDir);
    writeClientRoutes(project, outDir);
    ensureFallback(outDir, ['404.html', 'index.html']);
    return outDir;
  },
};

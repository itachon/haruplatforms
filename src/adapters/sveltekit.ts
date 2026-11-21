import fs from 'node:fs';
import path from 'node:path';
import type { Adapter, Finding, Project } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { readJson } from '../utils/fs.js';
import { run } from '../utils/exec.js';
import { addDevDeps, binCommand, copyOutput, findFiles, installDeps, listFew, readText, wrapConfig } from './shared.js';

const CONFIG_FILES = ['svelte.config.js', 'svelte.config.mjs'];
const OUT = '.todo2todo-build';

const routeFiles = (project: Project, name: RegExp) =>
  findFiles(project.root, new RegExp(String.raw`^src/routes/(.*/)?${name.source}$`));

function analyzeKit(project: Project): Finding[] {
  const findings: Finding[] = [
    {
      level: 'info',
      message: 'Se generará la versión estática de tu sitio (adapter-static).',
      hint: 'Las páginas que se puedan se generan al compilar; el resto funciona como app de una sola página.',
    },
  ];

  const endpoints = routeFiles(project, /\+server\.[jt]s/);
  if (endpoints.length) {
    findings.push({
      level: 'warn',
      message: `Tu proyecto tiene rutas de API (${listFew(endpoints)}).`,
      hint: 'No se incluirán en la app. Las páginas que las usen al compilar guardan esos datos; para datos en vivo publica tu proyecto en un servidor y llama a esa URL.',
    });
  }

  const serverPages = routeFiles(project, /\+(page|layout)\.server\.[jt]s/);
  const actions = serverPages.filter((f) => /export\s+const\s+actions\b/.test(readText(project.root, f)));
  if (actions.length) {
    findings.push({
      level: 'error',
      message: `Tu proyecto usa form actions (${listFew(actions)}).`,
      hint: 'Necesitan un servidor. Envía esos formularios con fetch a una API publicada.',
    });
  }

  const dynamicServer = serverPages.filter((f) => /\[[^\]]+\]/.test(f) && !actions.includes(f));
  if (dynamicServer.length) {
    findings.push({
      level: 'warn',
      message: `Hay rutas dinámicas que cargan datos en el servidor (${listFew(dynamicServer)}).`,
      hint: 'Solo tendrán datos las páginas enlazadas desde tu sitio (se generan al compilar). Para el resto, carga los datos en +page.js con fetch.',
    });
  }

  const hooks = findFiles(project.root, /^src\/hooks\.server\.[jt]s$/);
  if (hooks.length) {
    findings.push({
      level: 'warn',
      message: 'Tu proyecto tiene src/hooks.server, que no corre sin servidor.',
      hint: 'Validaciones de sesión o redirecciones hechas ahí no se aplicarán dentro de la app.',
    });
  }
  return findings;
}

/**
 * Sin indicación, SvelteKit no genera ninguna página al compilar. "auto" las
 * genera cuando se puede (y guarda los datos de sus load del servidor) y deja
 * el resto al router del cliente, vía la página 200.html.
 */
function enablePrerender(project: Project): void {
  const layouts = ['+layout.js', '+layout.ts'].map((f) => path.join(project.root, 'src', 'routes', f));
  const existing = layouts.find((f) => fs.existsSync(f));
  if (!existing) {
    fs.writeFileSync(layouts[0], "export const prerender = 'auto';\n");
    return;
  }
  const text = fs.readFileSync(existing, 'utf8');
  if (!/export\s+(const|let)\s+prerender\b/.test(text)) {
    fs.writeFileSync(existing, `${text}\nexport const prerender = 'auto';\n`);
  }
}

export const sveltekitAdapter: Adapter = {
  id: 'sveltekit',

  detect: (project) => hasDep(project, '@sveltejs/kit'),

  describe: (project) => `SvelteKit ${majorOf(depVersion(project, '@sveltejs/kit'))}`,

  analyze: analyzeKit,

  async build(project, outDir) {
    await installDeps(project);
    if (!hasDep(project, '@sveltejs/adapter-static')) {
      // Cada versión mayor de adapter-static sigue a una de SvelteKit (3 → Kit 2, 4 → Kit 3).
      const kitPkg = path.join(project.root, 'node_modules', '@sveltejs', 'kit', 'package.json');
      const kitMajor = Number(majorOf(readJson<{ version: string }>(kitPkg).version));
      await addDevDeps(project, [`@sveltejs/adapter-static@^${kitMajor + 1}`]);
    }
    enablePrerender(project);
    wrapConfig(
      project,
      CONFIG_FILES,
      'svelte.config.js',
      `import adapter from '@sveltejs/adapter-static';

const base = await __original();
const kit = base.kit ?? {};

export default {
  ...base,
  kit: {
    ...kit,
    adapter: adapter({ pages: '${OUT}', assets: '${OUT}', fallback: '200.html', strict: false }),
    // La app se sirve desde la raíz, aunque el sitio se publique en un subdirectorio.
    paths: { ...kit.paths, base: '', assets: '' },
    // Sin nombre fijo, SvelteKit usa Date.now() y, si carga su configuración dos
    // veces (p.ej. rutas "e:\\" y "E:\\" en Windows), el HTML y el JS quedan con
    // nombres distintos y la app no arranca.
    version: { ...kit.version, name: kit.version?.name ?? '${Date.now()}' },
    prerender: {
      ...kit.prerender,
      // Un enlace roto o un error de una página no debe impedir generar la app.
      handleHttpError: 'warn',
      handleMissingId: 'warn',
    },
  },
};
`,
    );
    await run(`${binCommand(project, 'vite')} build`, project.root);
    const built = path.join(project.root, OUT);
    // Si la página de inicio no se pudo generar, la página genérica la reemplaza.
    if (!fs.existsSync(path.join(built, 'index.html')) && fs.existsSync(path.join(built, '200.html'))) {
      fs.copyFileSync(path.join(built, '200.html'), path.join(built, 'index.html'));
    }
    return copyOutput(built, outDir);
  },
};

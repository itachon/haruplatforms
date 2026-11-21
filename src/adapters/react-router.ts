import fs from 'node:fs';
import path from 'node:path';
import type { Adapter, Finding, Project } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { run } from '../utils/exec.js';
import { binCommand, copyOutput, ensureFallback, findFiles, installDeps, listFew, readText, wrapConfig } from './shared.js';

const RR_CONFIG = ['react-router.config.ts', 'react-router.config.mts', 'react-router.config.js', 'react-router.config.mjs'];
const VITE_CONFIG = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'];

/** Carpeta de rutas: "app" salvo que la configuración diga otra cosa. */
function appDir(project: Project): string {
  const config = RR_CONFIG.find((f) => fs.existsSync(path.join(project.root, f)));
  const custom = config && readText(project.root, config).match(/appDirectory\s*:\s*['"]([^'"]+)['"]/);
  return (custom?.[1] ?? 'app').replace(/^\.\//, '').replace(/\/$/, '');
}

function analyzeRR(project: Project): Finding[] {
  const findings: Finding[] = [
    {
      level: 'info',
      message: 'Se generará la versión estática de tu sitio (ssr: false con prerender).',
      hint: 'Las rutas sin parámetros se generan al compilar; las demás funcionan como app de una sola página.',
    },
  ];
  const dir = appDir(project);
  const code = findFiles(project.root, new RegExp(`^${dir}/.+\\.(m?[jt]sx?)$`));
  const withLoader = code.filter((f) => /export\s+(async\s+)?(function|const)\s+loader\b/.test(readText(project.root, f)));
  const withAction = code.filter((f) => /export\s+(async\s+)?(function|const)\s+action\b/.test(readText(project.root, f)));

  if (withAction.length) {
    findings.push({
      level: 'error',
      message: `Tu proyecto tiene actions que corren en el servidor (${listFew(withAction)}).`,
      hint: 'Sin servidor no se pueden ejecutar. Cámbialas por clientAction que llame a una API publicada.',
    });
  }

  // El nombre del archivo no siempre refleja la URL (routes.ts puede mapear
  // cualquier ruta), así que solo podemos avisar: React Router detendrá la
  // compilación si una ruta con loader no se puede generar de antemano.
  const routesTs = ['routes.ts', 'routes.js'].map((f) => `${dir}/${f}`).find((f) => code.includes(f));
  const routesText = routesTs ? readText(project.root, routesTs) : '';
  const dynamicLoaders = withLoader.filter((f) => {
    const rel = f.slice(dir.length + 1);
    if (/\$|\[|:/.test(rel)) return true; // flat routes: productos.$id.tsx
    // routes.ts: route('productos/:id', 'routes/producto.tsx')
    const call = routesText.split('\n').find((line) => line.includes(rel));
    return !!call && /['"][^'"]*\/?:[\w]+/.test(call);
  });
  if (dynamicLoaders.length) {
    findings.push({
      level: 'error',
      message: `Hay rutas con parámetros que cargan datos en el servidor (loader en ${listFew(dynamicLoaders)}).`,
      hint: 'Sin servidor no se puede generar una página por cada valor. Cambia loader por clientLoader, o lista las páginas en "prerender" de react-router.config.',
    });
  }
  return findings;
}

export const reactRouterAdapter: Adapter = {
  id: 'react-router',

  detect: (project) => hasDep(project, '@react-router/dev'),

  describe: (project) => `React Router ${majorOf(depVersion(project, '@react-router/dev'))} (modo framework)`,

  analyze: analyzeRR,

  async build(project, outDir) {
    await installDeps(project);
    wrapConfig(
      project,
      RR_CONFIG,
      'react-router.config.ts',
      `const base = await __original();

export default {
  ...base,
  ssr: false,
  basename: '/',
  // Sin lista propia, se generan todas las rutas sin parámetros.
  prerender: base.prerender ?? true,
  // Los presets de hosting (Vercel, Netlify...) asumen un servidor.
  presets: (base.presets ?? []).filter((p) => !/vercel|netlify|cloudflare/i.test(p?.name ?? '')),
};
`,
    );
    wrapConfig(
      project,
      VITE_CONFIG,
      'vite.config.ts',
      `export default async (env) => ({ ...(await __original(env)), base: '/' });
`,
    );
    await run(`${binCommand(project, '@react-router/dev', 'react-router')} build`, project.root);
    const built = path.join(project.root, 'build', 'client');
    copyOutput(built, outDir);
    // Con rutas generadas, la página para el resto queda en __spa-fallback.html.
    ensureFallback(outDir, ['__spa-fallback.html']);
    return outDir;
  },
};

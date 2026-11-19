import fs from 'node:fs';
import path from 'node:path';
import type { Adapter, Finding, Project } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { run } from '../utils/exec.js';
import { binCommand, copyOutput, findFiles, installDeps, listFew, readText } from './shared.js';

const CONFIG_FILES = ['next.config.ts', 'next.config.mts', 'next.config.mjs', 'next.config.js', 'next.config.cjs'];
const CODE = String.raw`\.(m?[jt]sx?)$`;

function configFile(project: Project): string | undefined {
  return CONFIG_FILES.find((f) => fs.existsSync(path.join(project.root, f)));
}

/** Archivos que contienen el texto, dentro de los que cumplen el patrón. */
function filesWith(project: Project, files: string[], text: RegExp): string[] {
  return files.filter((f) => text.test(readText(project.root, f)));
}

function analyzeNext(project: Project): Finding[] {
  const findings: Finding[] = [];
  const code = findFiles(project.root, new RegExp(CODE));
  const appFiles = code.filter((f) => /^(src\/)?app\//.test(f));
  const pageFiles = code.filter((f) => /^(src\/)?pages\//.test(f));

  findings.push({
    level: 'info',
    message: 'Se generará la versión estática de tu sitio (output: "export").',
    hint: 'Todo lo que necesite un servidor de Next.js en cada visita no puede ir dentro de la app.',
  });

  const apiRoutes = [
    ...pageFiles.filter((f) => /^(src\/)?pages\/api\//.test(f)),
    ...appFiles.filter((f) => /\/route\.(m?[jt]sx?)$/.test(f)),
  ];
  if (apiRoutes.length) {
    findings.push({
      level: 'warn',
      message: `Tu proyecto tiene rutas de API (${listFew(apiRoutes)}).`,
      hint: 'Se quitarán de la app. Publica tu proyecto en un servidor (p.ej. Vercel) y haz que la app llame a esa URL.',
    });
  }

  const ssrPages = filesWith(project, pageFiles, /getServerSideProps/);
  if (ssrPages.length) {
    findings.push({
      level: 'error',
      message: `Hay páginas que se generan en el servidor en cada visita (getServerSideProps en ${listFew(ssrPages)}).`,
      hint: 'Cámbialas a getStaticProps o carga los datos desde el navegador con fetch.',
    });
  }

  const serverActions = filesWith(project, code, /^\s*['"]use server['"]/m);
  if (serverActions.length) {
    findings.push({
      level: 'error',
      message: `Tu proyecto usa Server Actions ("use server" en ${listFew(serverActions)}).`,
      hint: 'Necesitan un servidor. Muévelas a rutas de una API publicada y llámalas con fetch.',
    });
  }

  const dynamicApi = filesWith(project, appFiles, /\b(cookies|headers|draftMode)\s*\(\)/);
  if (dynamicApi.length) {
    findings.push({
      level: 'error',
      message: `Hay páginas que leen cookies o cabeceras en el servidor (${listFew(dynamicApi)}).`,
      hint: 'En una app no hay servidor: lee esos datos desde el navegador.',
    });
  }

  // Rutas dinámicas: sin servidor hay que conocer de antemano todas las páginas.
  const missingParams = appFiles
    .filter((f) => /\[[^\]]+\]\/page\.(m?[jt]sx?)$/.test(f))
    .filter((f) => !/generateStaticParams/.test(readText(project.root, f)));
  const missingPaths = pageFiles
    .filter((f) => /\[[^\]]+\]/.test(f) && !/\/api\//.test(f))
    .filter((f) => !/getStaticPaths/.test(readText(project.root, f)));
  const dynamic = [...missingParams, ...missingPaths];
  if (dynamic.length) {
    findings.push({
      level: 'error',
      message: `Hay rutas dinámicas sin lista de páginas (${listFew(dynamic)}).`,
      hint: 'Agrega generateStaticParams (carpeta app) o getStaticPaths (carpeta pages) para indicar qué páginas generar.',
    });
  }

  const middleware = code.filter((f) => /^(src\/)?(middleware|proxy)\.(m?[jt]s)$/.test(f));
  if (middleware.length) {
    findings.push({
      level: 'warn',
      message: `Tu proyecto tiene middleware (${middleware.join(', ')}), que no funciona sin servidor.`,
      hint: 'Se quitará de la app: redirecciones o validaciones de sesión hechas ahí no se aplicarán.',
    });
  }

  const config = configFile(project);
  if (config && /\b(rewrites|redirects|headers)\s*[:(]/.test(readText(project.root, config))) {
    findings.push({
      level: 'warn',
      message: `${config} define rewrites, redirects o headers.`,
      hint: 'Esas reglas las aplica el servidor de Next.js y se ignorarán dentro de la app.',
    });
  }
  return findings;
}

/**
 * Quita de la copia lo que solo puede correr en un servidor y haría fallar la
 * exportación. Las rutas marcadas como "force-static" sí se exportan.
 */
function stripServerOnly(project: Project): void {
  const code = findFiles(project.root, new RegExp(CODE));
  const remove = [
    ...code.filter((f) => /^(src\/)?pages\/api\//.test(f)),
    ...code.filter(
      (f) => /^(src\/)?app\/.*\/route\.(m?[jt]sx?)$/.test(f) && !/force-static/.test(readText(project.root, f)),
    ),
    ...code.filter((f) => /^(src\/)?(middleware|proxy)\.(m?[jt]s)$/.test(f)),
  ];
  for (const f of remove) fs.rmSync(path.join(project.root, f));
}

/**
 * En lugar de editar la configuración (que puede tener cualquier forma:
 * objeto, función, plugins como withX(...)), la renombramos y la envolvemos
 * con otra que fuerza la exportación estática.
 */
function patchConfig(project: Project): void {
  const current = configFile(project);
  let importLine = '';
  let target = 'next.config.mjs';
  if (current) {
    const ext = path.extname(current);
    const original = `next.config.original${ext}`;
    fs.renameSync(path.join(project.root, current), path.join(project.root, original));
    const isTs = ext === '.ts' || ext === '.mts';
    target = isTs ? current : 'next.config.mjs';
    importLine = `import original from './next.config.original${isTs ? '' : ext}';\n`;
  }
  fs.writeFileSync(
    path.join(project.root, target),
    `// @ts-nocheck
// Generado por todo2todo: exportación estática para empaquetar como app.
${importLine}
export default async function config(phase, context) {
  const base = ${importLine ? `typeof original === 'function' ? await original(phase, context) : original` : '{}'};
  // Opciones que requieren servidor (rutas, renderizado parcial) se descartan.
  const { basePath, assetPrefix, distDir, cacheComponents, partialPrefetching, ...rest } = base ?? {};
  const { ppr, dynamicIO, cacheComponents: expCache, ...experimental } = rest.experimental ?? {};
  return {
    ...rest,
    experimental,
    output: 'export',
    images: { ...rest.images, unoptimized: true },
    // Un error de tipos no debe impedir generar la app.
    typescript: { ...rest.typescript, ignoreBuildErrors: true },
    // La copia de trabajo puede quedar dentro de otro proyecto con su propio lockfile.
    turbopack: { ...rest.turbopack, root: process.cwd() },
    outputFileTracingRoot: process.cwd(),
  };
}
`,
  );
}

/**
 * Next 16 exporta los segmentos RSC como carpetas (a/__next.a/__PAGE__.txt),
 * pero el cliente los pide con puntos (a/__next.a.__PAGE__.txt); en un hosting
 * lo traduce el servidor. Agregamos la versión plana para no depender de eso.
 */
function flattenSegments(outDir: string): void {
  for (const rel of findFiles(outDir, /(^|\/)__next\.[^/]*\/.+\.txt$/, new Set())) {
    const parts = rel.split('/');
    const start = parts.findIndex((p) => p.startsWith('__next.'));
    const flat = [...parts.slice(0, start), parts.slice(start).join('.')].join('/');
    const dest = path.join(outDir, flat);
    if (!fs.existsSync(dest)) fs.copyFileSync(path.join(outDir, rel), dest);
  }
}

export const nextAdapter: Adapter = {
  id: 'next',

  detect: (project) => hasDep(project, 'next'),

  describe: (project) => `Next.js ${majorOf(depVersion(project, 'next'))}`,

  analyze: analyzeNext,

  async build(project, outDir) {
    await installDeps(project);
    stripServerOnly(project);
    patchConfig(project);
    await run(`${binCommand(project, 'next')} build`, project.root, { NEXT_TELEMETRY_DISABLED: '1' });
    copyOutput(path.join(project.root, 'out'), outDir);
    flattenSegments(outDir);
    return outDir;
  },
};

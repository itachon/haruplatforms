import fs from 'node:fs';
import path from 'node:path';
import type { Adapter, Finding, Project } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { run } from '../utils/exec.js';
import { binCommand, copyOutput, findFiles, installDeps, listFew } from './shared.js';

const CONFIG_FILES = ['nuxt.config.ts', 'nuxt.config.mts', 'nuxt.config.mjs', 'nuxt.config.js'];

/**
 * baseURL y cdnURL se fijan al compilar, así que no basta con variables de
 * entorno: envolvemos la configuración original para forzarlos.
 */
function patchConfig(project: Project): void {
  const current = CONFIG_FILES.find((f) => fs.existsSync(path.join(project.root, f)));
  let importLine = '';
  let target = 'nuxt.config.ts';
  if (current) {
    const ext = path.extname(current);
    fs.renameSync(path.join(project.root, current), path.join(project.root, `nuxt.config.original${ext}`));
    target = current;
    importLine = `import original from './nuxt.config.original${ext === '.ts' || ext === '.mts' ? '' : ext}';\n`;
  }
  fs.writeFileSync(
    path.join(project.root, target),
    `// @ts-nocheck
// Generado por todo2todo: sitio estático servido desde la raíz de la app.
${importLine}
const base = ${importLine ? `typeof original === 'function' ? await original() : original` : '{}'};

export default {
  ...base,
  app: { ...base?.app, baseURL: '/', cdnURL: '' },
  typescript: { ...base?.typescript, typeCheck: false },
};
`,
  );
}

export const nuxtAdapter: Adapter = {
  id: 'nuxt',

  detect: (project) => hasDep(project, 'nuxt'),

  describe: (project) => `Nuxt ${majorOf(depVersion(project, 'nuxt'))}`,

  analyze(project) {
    const findings: Finding[] = [
      {
        level: 'info',
        message: 'Se generará la versión estática de tu sitio (nuxt generate).',
      },
    ];
    const serverRoutes = findFiles(project.root, /^server\/(api|routes)\/.+\.(m?[jt]s)$/);
    if (serverRoutes.length) {
      findings.push({
        level: 'warn',
        message: `Tu proyecto tiene rutas de servidor (${listFew(serverRoutes)}).`,
        hint: 'No se incluirán en la app. Publica tu proyecto en un servidor y haz que la app llame a esa URL.',
      });
    }
    return findings;
  },

  async build(project, outDir) {
    await installDeps(project);
    patchConfig(project);
    await run(`${binCommand(project, 'nuxt')} generate`, project.root, { NUXT_TELEMETRY_DISABLED: '1' });
    return copyOutput(path.join(project.root, '.output', 'public'), outDir);
  },
};

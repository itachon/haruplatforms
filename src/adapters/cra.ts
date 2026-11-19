import type { Adapter, Finding } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { run } from '../utils/exec.js';
import { binCommand, installDeps } from './shared.js';

export const craAdapter: Adapter = {
  id: 'cra',

  detect: (project) => hasDep(project, 'react-scripts'),

  describe: (project) => `React ${majorOf(depVersion(project, 'react'))} (Create React App)`,

  analyze(project) {
    const findings: Finding[] = [];
    const { proxy } = project.pkg as { proxy?: string };
    if (proxy) {
      findings.push({
        level: 'warn',
        message: `Tu proyecto usa "proxy": "${proxy}" para llamar a la API.`,
        hint: 'El proxy solo existe mientras desarrollas. En la app, las llamadas a rutas relativas como /api no llegarán a tu servidor: usa su URL completa.',
      });
    }
    return findings;
  },

  async build(project, outDir) {
    await installDeps(project);
    const env: Record<string, string> = {
      PUBLIC_URL: '/', // ignora "homepage" (p.ej. GitHub Pages)
      BUILD_PATH: outDir,
      CI: 'false', // con CI=true las advertencias de ESLint detienen la compilación
      GENERATE_SOURCEMAP: 'false',
    };
    // react-scripts 4 usa webpack 4, que requiere OpenSSL legado en Node 17+.
    if (Number(majorOf(depVersion(project, 'react-scripts'))) < 5) {
      env.NODE_OPTIONS = '--openssl-legacy-provider';
    }
    await run(`${binCommand(project, 'react-scripts')} build`, project.root, env);
    return outDir;
  },
};

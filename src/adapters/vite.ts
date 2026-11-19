import fs from 'node:fs';
import path from 'node:path';
import type { Adapter, Finding } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { run, q } from '../utils/exec.js';
import { binCommand, installDeps } from './shared.js';

const FRAMEWORKS: [dep: string, label: string][] = [
  ['vue', 'Vue'],
  ['react', 'React'],
  ['preact', 'Preact'],
  ['solid-js', 'Solid'],
  ['svelte', 'Svelte'],
  ['lit', 'Lit'],
];

export const viteAdapter: Adapter = {
  id: 'vite',

  detect: (project) => hasDep(project, 'vite'),

  describe(project) {
    const found = FRAMEWORKS.find(([dep]) => hasDep(project, dep));
    const fw = found ? `${found[1]} ${majorOf(depVersion(project, found[0]))}`.trim() : 'JavaScript';
    return `${fw} + Vite`;
  },

  analyze(project) {
    const findings: Finding[] = [];
    if (!fs.existsSync(path.join(project.root, 'index.html'))) {
      findings.push({
        level: 'error',
        message: 'No se encontró index.html en la raíz del proyecto.',
        hint: 'Vite necesita un index.html como punto de entrada.',
      });
    }
    return findings;
  },

  async build(project, outDir) {
    await installDeps(project);
    // Llamamos a Vite directamente: así no bloquean errores de tipos (vue-tsc, tsc)
    // y forzamos base "/", que es lo que esperan los contenedores nativos.
    await run(`${binCommand(project, 'vite')} build --base / --outDir ${q(outDir)} --emptyOutDir`, project.root);
    return outDir;
  },
};

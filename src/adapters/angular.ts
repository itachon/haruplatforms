import fs from 'node:fs';
import path from 'node:path';
import type { Adapter, Finding, Project } from '../types.js';
import { depVersion, hasDep, majorOf } from '../project.js';
import { run, q } from '../utils/exec.js';
import { readJson, writeJson } from '../utils/fs.js';
import { binCommand, copyOutput, installDeps } from './shared.js';

interface BuildTarget {
  builder: string;
  options?: Record<string, unknown>;
  configurations?: Record<string, Record<string, unknown>>;
}

interface AngularJson {
  defaultProject?: string;
  projects: Record<string, { projectType?: string; architect?: { build?: BuildTarget } }>;
}

function readWorkspace(project: Project): AngularJson | undefined {
  const file = path.join(project.root, 'angular.json');
  return fs.existsSync(file) ? readJson<AngularJson>(file) : undefined;
}

/** Primer proyecto de tipo aplicación (los de tipo librería no se pueden empaquetar). */
function appProject(ws: AngularJson): [string, BuildTarget] | undefined {
  const names = [ws.defaultProject, ...Object.keys(ws.projects)].filter(Boolean) as string[];
  for (const name of names) {
    const p = ws.projects[name];
    if (p?.projectType === 'application' && p.architect?.build) return [name, p.architect.build];
  }
  return undefined;
}

const usesSsr = (build: BuildTarget) => !!(build.options?.ssr || build.options?.server || build.options?.prerender);

export const angularAdapter: Adapter = {
  id: 'angular',

  detect: (project) => hasDep(project, '@angular/core'),

  describe: (project) => `Angular ${majorOf(depVersion(project, '@angular/core'))}`,

  analyze(project) {
    const findings: Finding[] = [];
    const ws = readWorkspace(project);
    const app = ws && appProject(ws);
    if (!app) {
      findings.push({
        level: 'error',
        message: 'No se encontró una aplicación en angular.json.',
        hint: 'El proyecto debe tener al menos un proyecto con "projectType": "application".',
      });
      return findings;
    }
    if (usesSsr(app[1])) {
      findings.push({
        level: 'info',
        message: 'Tu app usa renderizado en servidor (SSR). Se empaquetará la versión que corre solo en el dispositivo.',
        hint: 'Si tu archivo server.ts define rutas de API, esas no estarán disponibles dentro de la app.',
      });
    }
    return findings;
  },

  async build(project, outDir) {
    await installDeps(project);

    // Ajustamos angular.json en la copia: sin SSR, sin límites de tamaño y
    // con la salida donde la esperamos.
    const file = path.join(project.root, 'angular.json');
    const ws = readJson<AngularJson>(file);
    const [name, build] = appProject(ws)!;
    const rawOut = path.join(path.dirname(outDir), 'angular-out');
    const options = (build.options ??= {});
    options.outputPath = rawOut;
    options.baseHref = '/';
    for (const key of ['ssr', 'server', 'prerender', 'outputMode', 'appShell']) delete options[key];
    for (const config of Object.values(build.configurations ?? {})) {
      for (const key of ['budgets', 'ssr', 'server', 'prerender', 'outputMode', 'appShell']) delete config[key];
    }
    writeJson(file, ws);

    await run(`${binCommand(project, '@angular/cli', 'ng')} build ${q(name)} --configuration production`, project.root, {
      NG_CLI_ANALYTICS: 'false',
    });

    // El builder "application" (Angular 17+) escribe en <outputPath>/browser.
    const browserDir = path.join(rawOut, 'browser');
    return copyOutput(fs.existsSync(browserDir) ? browserDir : rawOut, outDir);
  },
};

import fs from 'node:fs';
import path from 'node:path';
import { detect, SUPPORTED_SUMMARY, type Detection } from './adapters/index.js';
import { commonFindings, loadProject } from './project.js';
import { buildCapacitor } from './targets/capacitor.js';
import { buildElectron, canBuildDesktop } from './targets/electron.js';
import { DESKTOP, MOBILE, type AppConfig, type Artifact, type Finding, type Platform, type Project } from './types.js';
import { cleanDir, IGNORED_DIRS } from './utils/fs.js';
import { log } from './utils/log.js';

export interface Analysis {
  project: Project;
  detection: Detection;
  findings: Finding[];
}

export function analyze(root: string): Analysis {
  const project = loadProject(root);
  const detection = detect(project);
  const findings: Finding[] = [];

  if (detection.kind === 'supported') {
    findings.push({ level: 'ok', message: `Detectamos ${detection.label}.` });
    findings.push(...detection.adapter.analyze(project));
  } else if (detection.kind === 'planned') {
    findings.push({
      level: 'error',
      message: `Detectamos ${detection.label}, que todavía no es compatible.`,
      hint: `Estamos trabajando en ello. ${SUPPORTED_SUMMARY}`,
    });
  } else {
    findings.push({
      level: 'error',
      message: 'No pudimos reconocer el framework de este proyecto.',
      hint: SUPPORTED_SUMMARY,
    });
  }
  findings.push(...commonFindings(project));
  return { project, detection, findings };
}

export interface BuildOptions {
  app: AppConfig;
  platforms: Platform[];
  outDir: string;
}

export async function build(analysis: Analysis, options: BuildOptions): Promise<Artifact[]> {
  const { project, detection } = analysis;
  if (detection.kind !== 'supported') throw new Error('El proyecto no es compatible.');

  const outDir = path.resolve(options.outDir);
  const workDir = path.join(outDir, '.work');
  fs.mkdirSync(outDir, { recursive: true });

  log.step('Copiando el proyecto (tu código original no se modifica)');
  const sourceCopy = path.join(workDir, 'source');
  cleanDir(sourceCopy);
  fs.cpSync(project.root, sourceCopy, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(project.root, src);
      const base = path.basename(src);
      if (base === 'node_modules' || base === '.git') return false;
      // Carpetas generadas (dist, build, android...) solo se ignoran en la raíz.
      if (rel && !rel.includes(path.sep) && IGNORED_DIRS.has(base)) return false;
      return !path.resolve(src).startsWith(outDir);
    },
  });
  const workProject: Project = { ...project, root: sourceCopy };

  log.step(`Compilando la app web (${detection.label})`);
  const webDir = await detection.adapter.build(workProject, path.join(workDir, 'web'));
  if (!fs.existsSync(path.join(webDir, 'index.html'))) {
    throw new Error('La compilación terminó pero no generó un index.html.');
  }
  log.ok('App web compilada');

  const artifacts: Artifact[] = [];
  const desktop = options.platforms.filter((p) => DESKTOP.includes(p));
  const mobile = options.platforms.filter((p) => MOBILE.includes(p));

  const skipped = desktop.filter((p) => !canBuildDesktop(p));
  for (const p of skipped) log.warn(`La versión para ${p} solo se puede generar desde una Mac. Se omite.`);
  const buildable = desktop.filter(canBuildDesktop);

  if (buildable.length) {
    log.step(`Creando app de escritorio (${buildable.join(', ')})`);
    artifacts.push(...(await buildElectron(webDir, options.app, buildable, workDir, outDir)));
  }
  if (mobile.length) {
    log.step(`Creando app móvil (${mobile.join(', ')})`);
    artifacts.push(...(await buildCapacitor(webDir, options.app, mobile, workDir, outDir)));
  }
  return artifacts;
}

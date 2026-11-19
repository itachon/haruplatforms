import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig, Artifact, Platform } from '../types.js';
import { run } from '../utils/exec.js';
import { cleanDir, templatePath, writeJson } from '../utils/fs.js';
import { log } from '../utils/log.js';

const BUILDER_FLAG: Partial<Record<Platform, string>> = { windows: '--win', mac: '--mac', linux: '--linux' };
const ARTIFACT_EXT: Partial<Record<Platform, RegExp>> = {
  windows: /\.exe$/,
  mac: /\.dmg$/,
  linux: /\.AppImage$/,
};

/** Plataformas de escritorio que se pueden compilar desde el sistema actual. */
export function canBuildDesktop(platform: Platform): boolean {
  // Las apps de Mac requieren macOS (firma y formato .dmg).
  return platform !== 'mac' || process.platform === 'darwin';
}

export async function buildElectron(
  webDir: string,
  app: AppConfig,
  platforms: Platform[],
  workDir: string,
  outDir: string,
): Promise<Artifact[]> {
  const shell = path.join(workDir, 'electron');
  cleanDir(shell);
  fs.cpSync(templatePath('electron'), shell, { recursive: true });
  fs.cpSync(webDir, path.join(shell, 'web'), { recursive: true });

  if (app.icon) {
    fs.mkdirSync(path.join(shell, 'build'), { recursive: true });
    fs.copyFileSync(app.icon, path.join(shell, 'build', 'icon.png'));
  }

  writeJson(path.join(shell, 'package.json'), {
    name: app.id.split('.').pop(),
    productName: app.name,
    version: app.version,
    description: app.name,
    author: app.name,
    main: 'main.cjs',
    build: {
      appId: app.id,
      productName: app.name,
      artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
      directories: { output: 'release', buildResources: 'build' },
      files: ['main.cjs', 'preload.cjs', 'web/**/*'],
      win: { target: 'nsis' },
      nsis: { oneClick: true, perMachine: false },
      mac: { target: 'dmg', category: 'public.app-category.productivity' },
      linux: { target: 'AppImage', category: 'Utility' },
    },
  });

  log.info('Instalando Electron (la primera vez puede tardar unos minutos)...');
  await run('npm install --no-audit --no-fund --save-dev electron electron-builder', shell);

  const flags = platforms.map((p) => BUILDER_FLAG[p]).join(' ');
  log.info('Generando instaladores...');
  await run(`npx electron-builder ${flags} --publish never`, shell);

  const release = path.join(shell, 'release');
  const artifacts: Artifact[] = [];
  for (const platform of platforms) {
    const file = fs.readdirSync(release).find((f) => ARTIFACT_EXT[platform]!.test(f));
    if (!file) continue;
    const dest = path.join(outDir, file);
    fs.copyFileSync(path.join(release, file), dest);
    artifacts.push({ platform, path: dest });
  }
  return artifacts;
}

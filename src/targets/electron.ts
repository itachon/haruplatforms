import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig, Artifact, Platform } from '../types.js';
import { run } from '../utils/exec.js';
import { cleanDir, templatePath, writeJson } from '../utils/fs.js';
import { log } from '../utils/log.js';

const BUILDER_FLAG: Partial<Record<Platform, string>> = { windows: '--win', mac: '--mac', linux: '--linux' };
const ARTIFACT_EXT: Partial<Record<Platform, RegExp>> = {
  windows: /\.(exe|zip)$/,
  mac: /\.dmg$/,
  linux: /\.AppImage$/,
};

/** Plataformas de escritorio que se pueden compilar desde el sistema actual. */
export function canBuildDesktop(platform: Platform): boolean {
  // Las apps de Mac requieren macOS (firma y formato .dmg).
  return platform !== 'mac' || process.platform === 'darwin';
}

function hasCommand(cmd: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
}

const hasWine = () => hasCommand('wine') || hasCommand('wine64');

/** Comandos para instalar Wine según el gestor de paquetes disponible (Linux / WSL). */
function wineInstallCommands(): string[][] | null {
  if (hasCommand('apt-get')) {
    return [
      ['dpkg', '--add-architecture', 'i386'],
      ['apt-get', 'update'],
      ['apt-get', 'install', '-y', 'wine', 'wine64', 'wine32'],
    ];
  }
  if (hasCommand('dnf')) return [['dnf', 'install', '-y', 'wine']];
  if (hasCommand('pacman')) return [['pacman', '-S', '--noconfirm', '--needed', 'wine']];
  if (hasCommand('zypper')) return [['zypper', '--non-interactive', 'install', 'wine']];
  return null;
}

/** Intenta instalar Wine automáticamente. Puede pedir la contraseña de sudo. */
function installWine(): boolean {
  const steps = wineInstallCommands();
  if (!steps) return false;
  const isRoot = process.getuid?.() === 0;
  if (!isRoot && !hasCommand('sudo')) return false;

  log.info('Instalando Wine para poder crear el instalador de Windows (puede pedir tu contraseña)...');
  for (const step of steps) {
    const [cmd, args] = isRoot ? [step[0], step.slice(1)] : ['sudo', step];
    console.log(`    $ ${cmd} ${args.join(' ')}`);
    const res = spawnSync(cmd, args, { stdio: 'inherit' });
    if (res.status !== 0) return false;
  }
  return hasWine();
}

/**
 * El instalador NSIS (.exe) necesita Wine cuando se genera fuera de Windows.
 * En Linux / WSL se instala solo si falta; si no se puede, se genera un .zip
 * portable (la app lista para descomprimir y usar).
 */
function windowsTarget(): string {
  if (process.platform === 'win32' || hasWine()) return 'nsis';
  if (process.platform === 'linux' && installWine()) {
    log.ok('Wine instalado');
    return 'nsis';
  }
  log.warn(
    'No se pudo usar Wine: no se puede crear el instalador .exe desde este sistema. ' +
      'Se generará un .zip portable para Windows. Para el instalador, instala Wine ' +
      'manualmente o ejecuta todo2todo desde Windows.',
  );
  return 'zip';
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

  const winTarget = platforms.includes('windows') ? windowsTarget() : 'nsis';

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
      win: { target: winTarget },
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

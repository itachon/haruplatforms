import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig, Artifact, Platform } from '../types.js';
import { run, q } from '../utils/exec.js';
import { cleanDir, templatePath, writeJson } from '../utils/fs.js';
import { log } from '../utils/log.js';

export function findAndroidSdk(): string | undefined {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ];
  return candidates.find((dir): dir is string => !!dir && fs.existsSync(path.join(dir, 'platform-tools')));
}

export async function buildCapacitor(
  webDir: string,
  app: AppConfig,
  platforms: Platform[],
  workDir: string,
  outDir: string,
): Promise<Artifact[]> {
  const shell = path.join(workDir, 'mobile');
  cleanDir(shell);
  fs.cpSync(webDir, path.join(shell, 'web'), { recursive: true });

  writeJson(path.join(shell, 'package.json'), {
    name: app.id.split('.').pop(),
    version: app.version,
    private: true,
  });
  writeJson(path.join(shell, 'capacitor.config.json'), {
    appId: app.id,
    appName: app.name,
    webDir: 'web',
  });

  const packages = ['@capacitor/core', '@capacitor/cli', ...platforms.map((p) => `@capacitor/${p}`)];
  if (app.icon) packages.push('@capacitor/assets');
  log.info('Instalando Capacitor...');
  await run(`npm install --no-audit --no-fund ${packages.join(' ')}`, shell);

  const artifacts: Artifact[] = [];
  for (const platform of platforms) {
    await run(`npx cap add ${platform}`, shell);
    if (platform === 'android') installMainActivity(shell, app);
    if (app.icon) await generateIcons(shell, app.icon, platform);
    artifacts.push(platform === 'android' ? await compileAndroid(shell, app, outDir) : await prepareIos(shell, outDir));
  }
  return artifacts;
}

/** Reemplaza la actividad generada por una que entiende sitios multipágina. */
function installMainActivity(shell: string, app: AppConfig): void {
  const file = path.join(shell, 'android', 'app', 'src', 'main', 'java', ...app.id.split('.'), 'MainActivity.java');
  const template = fs.readFileSync(templatePath('android', 'MainActivity.java'), 'utf8');
  fs.writeFileSync(file, template.replace('__PACKAGE__', app.id));
}

async function generateIcons(shell: string, icon: string, platform: Platform): Promise<void> {
  const assets = path.join(shell, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.copyFileSync(icon, path.join(assets, 'icon.png'));
  await run(`npx capacitor-assets generate --${platform}`, shell);
}

async function compileAndroid(shell: string, app: AppConfig, outDir: string): Promise<Artifact> {
  const project = path.join(shell, 'android');
  const sdk = findAndroidSdk();
  if (!sdk) {
    const dest = copyProject(shell, outDir, 'android-project');
    return {
      platform: 'android',
      path: dest,
      note: 'No se encontró el Android SDK; se generó el proyecto sin compilar. Instala Android Studio (o define ANDROID_HOME) y vuelve a ejecutar, o en esa carpeta corre "npm install" y abre android/ en Android Studio.',
    };
  }

  fs.writeFileSync(path.join(project, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);
  // Ruta absoluta: algunas shells no buscan ejecutables en la carpeta actual.
  const gradlew = q(path.join(project, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'));
  log.info('Compilando APK con Gradle (la primera vez descarga varias dependencias)...');
  // Sin daemon: un Gradle residente bloquea la carpeta y impide recompilar.
  await run(`${gradlew} assembleDebug --no-daemon`, project);

  const apk = path.join(project, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const dest = path.join(outDir, `${app.name}-${app.version}-android-debug.apk`);
  fs.copyFileSync(apk, dest);
  return {
    platform: 'android',
    path: dest,
    note: 'APK de prueba (firmado con clave de depuración). Para Play Store hace falta una versión firmada.',
  };
}

async function prepareIos(shell: string, outDir: string): Promise<Artifact> {
  const dest = copyProject(shell, outDir, 'ios-project');
  return {
    platform: 'ios',
    path: dest,
    note:
      process.platform === 'darwin'
        ? `Corre "npm install" en ${q(dest)} y abre ios/App/App.xcodeproj en Xcode para firmar y generar el .ipa.`
        : 'Las apps de iOS solo se compilan en macOS con Xcode. Copia esta carpeta a una Mac o usa un servicio de compilación en la nube.',
  };
}

function copyProject(src: string, outDir: string, name: string): string {
  const dest = path.join(outDir, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, filter: (f) => path.basename(f) !== 'node_modules' });
  return dest;
}

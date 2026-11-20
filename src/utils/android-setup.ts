import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, q } from './exec.js';
import { log } from './log.js';

/**
 * Instalación automática (Linux / WSL) de lo necesario para compilar el APK:
 * un JDK 21 y el Android SDK. Todo va a la carpeta del usuario, sin sudo.
 */

const JDK_DIR = path.join(os.homedir(), '.todo2todo', 'jdk-21');
const SDK_DIR = path.join(os.homedir(), 'Android', 'Sdk');
const CMDLINE_TOOLS_URL = 'https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip';
const MIN_JAVA = 21;

function adoptiumUrl(): string {
  const arch = os.arch() === 'arm64' ? 'aarch64' : 'x64';
  return `https://api.adoptium.net/v3/binary/latest/${MIN_JAVA}/ga/linux/${arch}/jdk/hotspot/normal/eclipse`;
}

/** Versión mayor del `java` indicado (o del PATH), o 0 si no hay. */
function javaMajor(javaBin = 'java'): number {
  const res = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
  const m = /version "(\d+)/.exec(`${res.stderr ?? ''}${res.stdout ?? ''}`);
  return m ? Number(m[1]) : 0;
}

export function canAutoSetupAndroid(): boolean {
  return process.platform === 'linux';
}

/** Devuelve variables de entorno con un JDK >= 21, instalándolo si hace falta. */
export async function ensureJava(): Promise<NodeJS.ProcessEnv> {
  const envHome = process.env.JAVA_HOME;
  if (envHome && javaMajor(path.join(envHome, 'bin', 'java')) >= MIN_JAVA) return {};
  if (!envHome && javaMajor() >= MIN_JAVA) return {};

  const privateJava = path.join(JDK_DIR, 'bin', 'java');
  if (!fs.existsSync(privateJava)) {
    log.info(`Descargando Java ${MIN_JAVA} (solo la primera vez)...`);
    const tmp = `${JDK_DIR}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    await run(`curl -fsSL ${q(adoptiumUrl())} | tar -xz -C ${q(tmp)} --strip-components=1`, os.homedir());
    fs.rmSync(JDK_DIR, { recursive: true, force: true });
    fs.renameSync(tmp, JDK_DIR);
    log.ok(`Java ${MIN_JAVA} instalado en ${JDK_DIR}`);
  }
  return { JAVA_HOME: JDK_DIR, PATH: `${path.join(JDK_DIR, 'bin')}${path.delimiter}${process.env.PATH}` };
}

/**
 * Instala el Android SDK (command-line tools + platform-tools + la plataforma
 * que pide el proyecto) en ~/Android/Sdk y acepta las licencias.
 */
export async function installAndroidSdk(javaEnv: NodeJS.ProcessEnv, compileSdk: number): Promise<string> {
  const latest = path.join(SDK_DIR, 'cmdline-tools', 'latest');
  const sdkmanager = path.join(latest, 'bin', 'sdkmanager');

  if (!fs.existsSync(sdkmanager)) {
    log.info('Descargando Android SDK (solo la primera vez, puede tardar unos minutos)...');
    const tmp = path.join(os.tmpdir(), `todo2todo-cmdline-${process.pid}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const zip = path.join(tmp, 'cmdline-tools.zip');
    await run(`curl -fsSL -o ${q(zip)} ${q(CMDLINE_TOOLS_URL)}`, tmp);
    // python3 viene en casi todas las distros; unzip muchas veces no.
    await run(`python3 -I -m zipfile -e ${q(zip)} ${q(tmp)}`, tmp);
    fs.mkdirSync(path.dirname(latest), { recursive: true });
    fs.rmSync(latest, { recursive: true, force: true });
    fs.renameSync(path.join(tmp, 'cmdline-tools'), latest);
    fs.rmSync(tmp, { recursive: true, force: true });
    // zipfile no conserva los permisos de ejecución.
    for (const f of fs.readdirSync(path.join(latest, 'bin'))) fs.chmodSync(path.join(latest, 'bin', f), 0o755);
  }

  const env = { ...javaEnv, ANDROID_HOME: SDK_DIR, ANDROID_SDK_ROOT: SDK_DIR };
  log.info('Aceptando licencias e instalando componentes del Android SDK...');
  await run(`yes | ${q(sdkmanager)} --sdk_root=${q(SDK_DIR)} --licenses`, SDK_DIR, env);
  await run(
    `${q(sdkmanager)} --sdk_root=${q(SDK_DIR)} "platform-tools" "platforms;android-${compileSdk}"`,
    SDK_DIR,
    env,
  );
  log.ok(`Android SDK instalado en ${SDK_DIR}`);
  return SDK_DIR;
}

/** Lee compileSdkVersion del proyecto generado por Capacitor. */
export function readCompileSdk(androidProject: string): number {
  try {
    const vars = fs.readFileSync(path.join(androidProject, 'variables.gradle'), 'utf8');
    const m = /compileSdkVersion\s*=\s*(\d+)/.exec(vars);
    if (m) return Number(m[1]);
  } catch {
    // sin variables.gradle: se usa el valor por defecto
  }
  return 36;
}

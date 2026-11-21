#!/usr/bin/env node
// Prueba de punta a punta de los ejemplos en examples/: abre la app generada
// (Electron o Android) y recorre el caso de uso común a todos.
//
//   node scripts/probar-app.mjs electron "out/<id>/.work/electron/release/win-unpacked/<App>.exe" [--sin-router]
//   node scripts/probar-app.mjs android  "out/<id>/<App>-android-debug.apk" <id> [--sin-router]
//
// --sin-router: sitios multipágina sin router de cliente (Astro). Una ruta no
// generada (/productos/99) debe mostrar la página 404 del sitio.
//
// Requiere Node 22+ (WebSocket global). Android: adb en el PATH o en el SDK, y un
// emulador o equipo conectado con depuración USB.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [mode, file, ...rest] = process.argv.slice(2);
const noRouter = rest.includes('--sin-router');
const appId = rest.find((a) => !a.startsWith('--'));
if (!['electron', 'android'].includes(mode) || !file || (mode === 'android' && !appId)) {
  console.error('Uso: probar-app.mjs electron <exe> | android <apk> <id>  [--sin-router]');
  process.exit(2);
}

const PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Protocolo de depuración (CDP) ----------

async function connect() {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
    } catch {}
    if (!target) await sleep(500);
  }
  if (!target) throw new Error('No se pudo conectar con la app (¿abrió la ventana?).');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(`${msg.params.entry.text} ${msg.params.entry.url ?? ''}`.trim());
    }
  };
  const send = (method, params = {}) =>
    new Promise((ok) => {
      pending.set(++id, ok);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable');
  await send('Log.enable');
  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return result?.result?.value;
  };
  return { evaluate, errors, close: () => ws.close(), origin: ((u) => `${u.protocol}//${u.host}`)(new URL(target.url)) };
}

// ---------- Caso de uso ----------

async function waitFor(app, what, check) {
  let last;
  for (let i = 0; i < 40; i++) {
    last = await app.evaluate(`({
      h1: document.querySelector('h1')?.textContent?.trim(),
      api: document.querySelector('#api')?.textContent?.trim(),
      path: location.pathname,
    })`);
    if (last && check(last)) return last;
    await sleep(250);
  }
  throw new Error(`${what}: se esperaba otra pantalla, se obtuvo ${JSON.stringify(last)}`);
}

const clickLink = (app, text) =>
  app.evaluate(`[...document.querySelectorAll('a')].find((a) => a.textContent.trim() === ${JSON.stringify(text)}).click()`);
const go = (app, url) => app.evaluate(`location.href = ${JSON.stringify(url)}`);

async function useCase(app) {
  const o = app.origin;
  const missing = noRouter ? (s) => /no encontrada/i.test(s.h1 ?? '') : (s) => s.h1 === 'Producto 99';
  const steps = [
    ['Inicio con datos de la API guardados al compilar', async () => {
      await go(app, `${o}/`);
      return waitFor(app, 'Inicio', (s) => /^Inicio/.test(s.h1 ?? '') && s.api === 'API: mundo');
    }],
    ['Enlace a una ruta dinámica generada (/productos/1)', async () => {
      await clickLink(app, 'Producto 1');
      return waitFor(app, 'Producto 1', (s) => s.h1 === 'Producto 1');
    }],
    ['Menú: enlace a /acerca', async () => {
      await clickLink(app, 'Acerca');
      return waitFor(app, 'Acerca', (s) => /^Acerca/.test(s.h1 ?? ''));
    }],
    ['Botón a una ruta no generada (/productos/99)', async () => {
      await go(app, `${o}/`);
      await waitFor(app, 'Inicio', (s) => /^Inicio/.test(s.h1 ?? ''));
      // El botón solo responde cuando el framework terminó de hidratar la página.
      for (let i = 0; i < 20; i++) {
        await app.evaluate(`document.getElementById('ir-99')?.click()`);
        await sleep(300);
        const s = await app.evaluate(`({ h1: document.querySelector('h1')?.textContent?.trim() })`);
        if (s && missing(s)) break;
      }
      return waitFor(app, 'Producto 99', missing);
    }],
    ['Abrir /acerca directamente (recargar)', async () => {
      await go(app, `${o}/acerca`);
      return waitFor(app, 'Acerca directo', (s) => /^Acerca/.test(s.h1 ?? ''));
    }],
    ['Abrir /productos/99 directamente (recargar)', async () => {
      await go(app, `${o}/productos/99`);
      return waitFor(app, 'Producto 99 directo', missing);
    }],
  ];

  let failed = 0;
  for (const [name, run] of steps) {
    try {
      const s = await run();
      console.log(`  ✔ ${name}  →  ${s.path} "${s.h1}"`);
    } catch (e) {
      failed++;
      console.log(`  ✖ ${name}\n      ${e.message}`);
    }
  }
  // Los 404 esperados (página no encontrada) no cuentan como errores.
  // favicon.ico: el navegador lo pide solo, aunque el sitio no tenga uno.
  const errors = app.errors.filter((e) => !(noRouter && /404/.test(e)) && !/favicon.ico/.test(e));
  if (errors.length) {
    failed++;
    console.log(`  ✖ Errores en la consola:\n${errors.map((e) => `      ${e}`).join('\n')}`);
  } else {
    console.log('  ✔ Sin errores en la consola');
  }
  return failed;
}

// ---------- Electron ----------

async function runElectron() {
  const exe = path.resolve(file);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'todo2todo-prueba-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`], { env, stdio: 'ignore' });
  try {
    const app = await connect();
    const failed = await useCase(app);
    app.close();
    return failed;
  } finally {
    child.kill();
  }
}

// ---------- Android ----------

function adbPath() {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ??
    (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : path.join(os.homedir(), 'Android', 'Sdk'));
  const exe = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  return fs.existsSync(exe) ? exe : 'adb';
}

async function runAndroid() {
  const adb = adbPath();
  const sh = (...args) => execFileSync(adb, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!/\tdevice/.test(sh('devices'))) throw new Error('No hay un emulador ni equipo Android conectado.');
  sh('install', '-r', path.resolve(file));
  sh('shell', 'am', 'force-stop', appId);
  sh('shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1');
  let socket;
  for (let i = 0; i < 40 && !socket; i++) {
    await sleep(500);
    const pid = sh('shell', 'pidof', appId).trim();
    if (pid && sh('shell', 'cat', '/proc/net/unix').includes(`webview_devtools_remote_${pid}`)) {
      socket = `webview_devtools_remote_${pid}`;
    }
  }
  if (!socket) throw new Error('La app no expone su WebView para depuración (¿es una compilación debug?).');
  sh('forward', `tcp:${PORT}`, `localabstract:${socket}`);
  try {
    const app = await connect();
    const failed = await useCase(app);
    app.close();
    return failed;
  } finally {
    sh('forward', '--remove', `tcp:${PORT}`);
    sh('shell', 'am', 'force-stop', appId);
  }
}

console.log(`\n▶ Probando ${path.basename(file)} (${mode})`);
const failed = await (mode === 'electron' ? runElectron() : runAndroid()).catch((e) => {
  console.log(`  ✖ ${e.message}`);
  return 1;
});
console.log(failed ? `\n✖ ${failed} prueba(s) fallaron` : '\n✔ Todo bien');
process.exit(failed ? 1 : 0);

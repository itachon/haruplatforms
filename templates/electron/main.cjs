// Contenedor de escritorio generado por todo2todo.
// Sirve la app web desde el protocolo app:// en lugar de file:// para que las
// rutas absolutas (/assets/...) y el router en modo "history" funcionen igual
// que en un servidor web.
const { app, BrowserWindow, protocol, net, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const WEB_ROOT = path.join(__dirname, 'web');
// Nuxt genera 200.html como página genérica para rutas no prerenderizadas;
// su index.html es la página de inicio ya renderizada.
const SPA_FALLBACK = ['200.html', 'index.html'].map((f) => path.join(WEB_ROOT, f)).find((f) => fs.existsSync(f));

// Rutas de solo cliente con su propia página (p.ej. Gatsby: /productos/:id →
// productos/[id]/index.html). Las escribe el adaptador al compilar.
const CLIENT_ROUTES = (() => {
  try {
    const routes = JSON.parse(fs.readFileSync(path.join(WEB_ROOT, 'todo2todo-routes.json'), 'utf8'));
    return routes.map((r) => ({ pattern: new RegExp(r.pattern), file: path.join(WEB_ROOT, r.file) }));
  } catch {
    return [];
  }
})();

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

const isFile = (file) => fs.existsSync(file) && fs.statSync(file).isFile();

function resolveFile(pathname) {
  const file = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(WEB_ROOT)) return null;
  if (isFile(file)) return file;
  if (path.extname(file)) return null;
  // Sitios multipágina (Next, Nuxt): /acerca → acerca.html o acerca/index.html.
  for (const candidate of [`${file}.html`, path.join(file, 'index.html')]) {
    if (isFile(candidate)) return candidate;
  }
  // Si no, es una ruta del router del cliente (SPA).
  const route = CLIENT_ROUTES.find((r) => r.pattern.test(pathname));
  if (route && isFile(route.file)) return route.file;
  return SPA_FALLBACK;
}

const APP_ORIGIN = `${SCHEME}://bundle`;

/** Lee o borra una cabecera sin importar mayúsculas. */
function header(headers, name, remove = false) {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return undefined;
  const value = headers[key];
  if (remove) delete headers[key];
  return Array.isArray(value) ? value.join(', ') : value;
}

/**
 * La app corre en app://bundle, que para su backend es otro sitio. Sin esto el
 * navegador bloquea las respuestas (CORS, el backend solo conoce los dominios web)
 * y no reenvía las cookies de sesión (SameSite). Para las peticiones que hace la
 * propia app: se responden los encabezados CORS que permiten app://bundle con
 * credenciales, y las cookies se guardan como SameSite=None para que viajen.
 */
function allowBackendRequests(ses) {
  const pending = new Map(); // id → { methods, headers } pedidos en el preflight

  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const h = details.requestHeaders;
    if (header(h, 'Origin') === APP_ORIGIN) {
      pending.set(details.id, {
        methods: header(h, 'Access-Control-Request-Method'),
        headers: header(h, 'Access-Control-Request-Headers'),
      });
    }
    callback({ requestHeaders: h });
  });

  ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const req = pending.get(details.id);
    pending.delete(details.id);
    if (!req || !details.responseHeaders) return callback({});

    const h = details.responseHeaders;
    for (const name of ['Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials',
      'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers']) header(h, name, true);
    h['Access-Control-Allow-Origin'] = [APP_ORIGIN];
    h['Access-Control-Allow-Credentials'] = ['true'];
    h['Access-Control-Allow-Methods'] = [req.methods || 'GET, POST, PUT, PATCH, DELETE, OPTIONS'];
    if (req.headers) h['Access-Control-Allow-Headers'] = [req.headers];

    const cookieKey = Object.keys(h).find((k) => k.toLowerCase() === 'set-cookie');
    if (cookieKey) {
      const list = [].concat(h[cookieKey]);
      delete h[cookieKey];
      h['Set-Cookie'] = list.map((c) => {
        let v = c.replace(/;\s*SameSite=[^;]*/gi, '') + '; SameSite=None';
        if (!/;\s*Secure\b/i.test(v)) v += '; Secure';
        return v;
      });
    }

    // Un preflight rechazado por el backend se responde como aceptado.
    const statusLine =
      details.method === 'OPTIONS' && details.statusCode >= 400 ? 'HTTP/1.1 204 No Content' : undefined;
    callback({ responseHeaders: h, ...(statusLine && { statusLine }) });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Los enlaces externos se abren en el navegador del sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => win.show());
  win.loadURL(`${SCHEME}://bundle/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, (request) => {
      const file = resolveFile(new URL(request.url).pathname);
      if (!file) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    allowBackendRequests(session.defaultSession);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

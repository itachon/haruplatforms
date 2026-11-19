// Contenedor de escritorio generado por todo2todo.
// Sirve la app web desde el protocolo app:// en lugar de file:// para que las
// rutas absolutas (/assets/...) y el router en modo "history" funcionen igual
// que en un servidor web.
const { app, BrowserWindow, protocol, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const WEB_ROOT = path.join(__dirname, 'web');
const INDEX = path.join(WEB_ROOT, 'index.html');

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
  return INDEX;
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
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

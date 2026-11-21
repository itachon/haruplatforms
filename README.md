# haruplatforms

Convierte un proyecto web JavaScript en una app de escritorio (Electron) o móvil (Capacitor), sin modificar el código original.

## Uso

```bash
npm install   # también compila dist/ (script "prepare")

# ¿Es compatible mi proyecto?
node dist/cli.js analyze ../mi-proyecto

# Generar instalador de Windows + app Android
node dist/cli.js build ../mi-proyecto -t windows,android -n "Mi App" --id com.miempresa.miapp -i icono.png
```

| Opción | Descripción |
|---|---|
| `-t, --target <lista>` | Plataformas separadas por coma: `windows`, `mac`, `linux`, `android`, `ios` |
| `-n, --name <nombre>` | Nombre visible de la app |
| `--id <id>` | Identificador único, p. ej. `com.miempresa.miapp` |
| `--version <x.y.z>` | Versión de la app |
| `-i, --icon <png>` | Ícono PNG cuadrado (se recomienda 1024×1024) |
| `-o, --out <carpeta>` | Carpeta de resultados (por defecto `./out/<id>`) |
| `--verbose` | Muestra toda la salida de los comandos |

Durante el desarrollo se puede usar `npm run dev -- <comando>` (ejecuta el TypeScript directamente con tsx). Si se cambia algo en `src/`, hay que volver a correr `npm run build` para que `node dist/cli.js` use la versión nueva.

## Frameworks soportados

| Framework | Estado | Qué se adapta en la copia |
|---|---|---|
| Vite + React | ✅ | `--base /`; se omite el chequeo de tipos |
| Vite + Vue | ✅ | ídem |
| Vite + Svelte | ✅ | ídem |
| Vite + Solid | ✅ | ídem |
| Vite + Preact | ✅ | ídem |
| Vite + Lit | ✅ | ídem |
| Create React App | ✅ | `PUBLIC_URL=/` (ignora `homepage`), las advertencias de ESLint no bloquean |
| Angular | ✅ | `angular.json`: sin SSR/prerender/budgets, `baseHref` `/` |
| Next.js | ✅ | `next.config` envuelto: `output: 'export'`, imágenes sin optimizar, sin PPR; se quitan rutas de API y middleware |
| Nuxt | ✅ | `nuxt.config` envuelto: `baseURL` `/`, sin módulos `@vercel/*`; `nuxt generate`. Las rutas no prerenderizadas usan `200.html` |
| SvelteKit | ✅ | `svelte.config` envuelto: `adapter-static` (versión acorde a Kit) con `200.html`, `paths.base` vacío, `prerender = 'auto'` en el layout raíz |
| React Router 7 (modo framework) | ✅ | `react-router.config` envuelto: `ssr: false`, `prerender` de rutas sin parámetros, `basename` `/`; Vite con `base` `/` |
| Astro | ✅ | `astro.config` envuelto: `output: 'static'`, sin adaptador, `base` `/`; se quitan páginas con `prerender = false`; su 404 queda como `200.html` |
| Gatsby | ✅ | `gatsby build` sin `--prefix-paths` (ignora `pathPrefix`); las rutas de solo cliente se sirven con su propia página |
| Remix 2 | 🔜 Detectado, pendiente | Se sugiere actualizar a React Router 7 (`npx codemod remix/2/react-router/upgrade`) |

- **Gestores de paquetes**: npm, pnpm, yarn y bun (se detecta por el archivo de lock).
- **SvelteKit**: el análisis marca como bloqueantes las form actions y avisa de rutas `+server`, `hooks.server` y rutas dinámicas que cargan datos en el servidor.
- **React Router 7**: bloquean las `action` y los `loader` en rutas con parámetros (se sugiere `clientLoader`).
- **Astro**: bloquean las rutas dinámicas sin `getStaticPaths` y las server islands (`server:defer`).
- **Gatsby**: bloquea `getServerData`; avisa de páginas DSG y de Gatsby Functions (`src/api`).
- **Next.js**: el análisis marca como bloqueantes `getServerSideProps`, Server Actions, `cookies()`/`headers()` y rutas dinámicas sin `generateStaticParams`/`getStaticPaths`.
- **Lo que no se lleva a la app**: todo lo que corre en un servidor (rutas `server/api` de Nuxt, rutas de API de Next, SSR). La app queda como sitio estático que habla con su backend por HTTP.

## Sistemas operativos

Qué se puede generar según el sistema donde se ejecuta haruplatforms:

| Generar → / Desde ↓ | Windows (`.exe`) | Linux (`.AppImage`) | Mac (`.dmg`) | Android (`.apk`) | iOS |
|---|---|---|---|---|---|
| **Windows** | ✅ | ⚠️ no garantizado | ❌ | ✅ con Android Studio | Proyecto Xcode |
| **Linux** | ✅ Wine se instala solo | ✅ | ❌ | ✅ Java y SDK se instalan solos | Proyecto Xcode |
| **WSL** | ✅ Wine se instala solo | ✅ | ❌ | ✅ Java y SDK se instalan solos | Proyecto Xcode |
| **macOS** | ⚠️ `.zip` sin Wine | ✅ | ✅ | ✅ con Android Studio | ✅ se compila en Xcode |

### Windows

Funciona directo: genera el instalador `.exe` (NSIS). Para Android hay que instalar Android Studio (o definir `ANDROID_HOME`) y un JDK 21.

### Linux y WSL

haruplatforms instala solo lo que falta la primera vez:

- **Instalador de Windows**: electron-builder necesita **Wine** para crear el `.exe` fuera de Windows. Si no está, se instala con el gestor de paquetes del sistema (`apt-get`, `dnf`, `pacman` o `zypper`) usando `sudo`, así que **pide la contraseña**. Si no se puede instalar (sin terminal interactiva, sin `sudo`, etc.), se genera un `.zip` portable de la app en lugar del instalador.
- **Android**: si no hay Java 21 se descarga a `~/.todo2todo/jdk-21` (solo lo usa haruplatforms), y si no hay Android SDK se instala en `~/Android/Sdk` con las licencias aceptadas. No necesita `sudo`. La primera vez descarga varios cientos de MB.

En **WSL** los resultados quedan en el sistema de archivos de Linux; desde Windows se abren en `\\wsl$\<distro>\home\<usuario>\...` o copiándolos a `/mnt/c/...`. Si se ejecuta desde la terminal de VS Code, haruplatforms quita `ELECTRON_RUN_AS_NODE`, que haría arrancar Electron como Node.

### macOS

Es el único sistema que genera la app de Mac (`.dmg`) y compila iOS. Para el instalador de Windows hay que instalar Wine a mano (`brew install --cask wine-stable`); si no, se genera un `.zip` portable.

## Cómo funciona

```
detectar → copiar a .work/source → compilar web → empaquetar
```

1. **Análisis** ([src/pipeline.ts](src/pipeline.ts), [src/project.ts](src/project.ts)): detecta el framework, revisa problemas (p. ej. URLs a `localhost` o login con proveedores externos) y los explica en lenguaje simple.
2. **Adaptador** ([src/adapters/](src/adapters/)): uno por framework. Instala dependencias y compila a un sitio estático. Se registran en [src/adapters/index.ts](src/adapters/index.ts).
3. **Destinos** ([src/targets/](src/targets/)):
   - **Escritorio**: plantilla Electron ([templates/electron/](templates/electron/)) que sirve la app por el protocolo `app://`, de modo que las rutas absolutas y el router en modo history funcionan sin tocar el proyecto. Instaladores con electron-builder.
   - Rutas de solo cliente: si el adaptador deja un `todo2todo-routes.json` (patrón de URL → página), Electron y Android sirven esa página para las URL que coinciden antes de recurrir a `200.html`. Lo usa Gatsby para `/productos/:id` → `productos/[id]/index.html`.
   - **Móvil**: proyecto Capacitor. En Android se reemplaza `MainActivity` ([templates/android/MainActivity.java](templates/android/MainActivity.java)) para que los sitios multipágina sirvan `/acerca` desde `acerca.html`, ya que Capacitor responde `index.html` a toda ruta sin extensión. iOS genera el proyecto Xcode.

## Pruebas

Cada framework tiene un caso de uso en [examples/](examples/) con el mismo recorrido: inicio con datos de una API de servidor (guardados al compilar), `/acerca`, una ruta dinámica generada (`/productos/1`) y otra que no (`/productos/99`), además de algo que solo corre en un servidor y debe quedar fuera de la app.

[scripts/probar-app.mjs](scripts/probar-app.mjs) abre la app generada, recorre ese caso por el protocolo de depuración de Chromium y revisa la consola:

```bash
node dist/cli.js build examples/sveltekit-demo -t windows,android -n "SvelteKit Demo" --id com.haruplatforms.sveltekitdemo

# Escritorio (la carpeta sin instalar que deja electron-builder)
node scripts/probar-app.mjs electron "out/com.haruplatforms.sveltekitdemo/.work/electron/release/win-unpacked/SvelteKit Demo.exe"

# Android (con un emulador abierto o un equipo conectado)
node scripts/probar-app.mjs android "out/com.haruplatforms.sveltekitdemo/SvelteKit Demo-1.0.0-android-debug.apk" com.haruplatforms.sveltekitdemo
```

Para sitios sin router de cliente (Astro) se agrega `--sin-router`: `/productos/99` debe mostrar la página 404 del sitio.

## Conexión con el backend (CORS y cookies de sesión)

Dentro de la app, la web ya no corre en su dominio sino en `app://bundle` (escritorio) o `https://localhost` (Android). Para el backend es otro sitio: el navegador bloquea las respuestas por CORS y no envía las cookies de sesión (`SameSite`). haruplatforms lo resuelve sin tocar el backend:

- **Escritorio**: el proceso principal de Electron agrega a las respuestas los encabezados CORS que permiten `app://bundle` con credenciales, acepta los preflight (`OPTIONS`) y guarda las cookies como `SameSite=None; Secure` (siguen siendo HttpOnly).
- **Android**: si el JS compilado usa `credentials: 'include'` o `withCredentials` (sesión por cookie), se activan `CapacitorHttp` y `CapacitorCookies`: las peticiones a otros dominios salen desde Android, sin CORS y con las cookies del backend (incluidas las HttpOnly).

WebSockets (p. ej. Laravel Reverb) no pasan por esto: el servidor debe aceptar cualquier origen o incluir los de la app.

## Requisitos

- Node 20+
- Android: Android SDK y JDK 21 (en Linux/WSL se instalan solos; en Windows/macOS, Android Studio)
- Instalador de Windows fuera de Windows: Wine (en Linux/WSL se instala solo)
- Mac e iOS: macOS con Xcode

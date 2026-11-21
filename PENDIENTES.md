# Pendientes

## Pedidos

### 1. Versionado de la app de escritorio (Electron)

Hoy la versión viene de `--version` o del `package.json` del proyecto y se usa en el instalador (`App-1.2.0-win-x64.exe`). Falta:

- [ ] **Actualizaciones automáticas**: con `electron-updater`, la app instalada busca una versión nueva y se actualiza sola. Hay que decidir dónde se publican las versiones (GitHub Releases, S3 o un servidor propio) y generar el `latest.yml` que electron-builder ya sabe producir (hoy se compila con `--publish never`).
- [ ] **Regla de versión**: si el proyecto no trae versión, hoy queda `1.0.0` siempre. Opciones: subir el último número en cada compilación o pedirla de forma explícita. Sin versión creciente, las actualizaciones automáticas no funcionan.
- [ ] **Firma de código**:
  - Windows: sin certificado, SmartScreen muestra "Windows protegió tu PC" y muchos usuarios no instalan.
  - Mac: hace falta notarizar con Apple para que la app abra sin advertencias.
- [ ] **Historial de versiones**: guardar qué se generó en cada versión (fecha, commit del proyecto, archivos) para poder volver a una anterior.

### 2. Subida y versionado en Play Store

Hoy se genera un **APK debug** (`assembleDebug`), que sirve para probar pero que Google Play no acepta. Falta:

- [ ] **Versión real en Android**: hoy el APK queda siempre con `versionName "1.0"` y `versionCode 1`, aunque se pase `--version 1.2.0`. Hay que escribirlos en `android/app/build.gradle`:
  - `versionName` = la versión de la app.
  - `versionCode` = número entero que **debe subir en cada envío**. Por ejemplo, derivado de la versión (`1.2.3` → `10203`) o guardado como contador.
- [ ] **Compilación de release**: generar un **AAB** (`bundleRelease`), que es el formato que pide Play Store, además del APK de prueba.
- [ ] **Firma (keystore)**: crear la clave de subida la primera vez y **guardarla de forma segura**. Sin ella no se pueden publicar actualizaciones de la misma app. Nunca subirla al repositorio.
- [ ] **Subida automática**: usar la API de Google Play (Google Play Developer API, o `fastlane supply`) con una cuenta de servicio, empezando por el track de **prueba interna** antes de producción.
- [ ] **Ficha de la tienda**: ícono de 512×512, gráfico destacado, capturas, descripción y política de privacidad (Google la exige). Se podría generar un borrador a partir del sitio.
- [ ] **Requisitos de Google**: `targetSdkVersion` reciente (Google lo sube cada año) y el formulario de seguridad de datos.

## Sugeridos

### Producto
- [ ] **Inicio de sesión con Google/GitHub dentro de la app**: hoy solo se avisa. Se puede resolver con deep links (`miapp://callback`) o abriendo el login en el navegador del sistema y volviendo a la app.
- [ ] **Pantalla de carga e íconos por plataforma**: splash screen en Android y tamaños de ícono adaptativos (hoy se usa un solo PNG).
- [ ] **iOS**: arreglar las rutas de sitios multipágina (como `MainActivity` en Android, pero en `CAPBridgeViewController`) y la subida a TestFlight/App Store. Necesita una Mac.
- [ ] **Remix 2**: hoy se detecta y se sugiere actualizar a React Router 7. Se podría soportar directamente si aparecen usuarios con Remix 2.
- [ ] **Modo sin conexión**: avisar o mostrar una pantalla propia cuando la app necesita internet para hablar con su backend y no hay red.

### Calidad
- [ ] **Pruebas automáticas en cada cambio**: correr `scripts/probar-app.mjs` en GitHub Actions para todos los ejemplos (escritorio en Windows, Android con emulador). Hoy se corre a mano.
- [ ] **Llevar el mismo caso de uso a los ejemplos anteriores** (Vite, CRA, Angular, Next, Nuxt) para probarlos con el mismo script. Hoy solo Nuxt y los cuatro nuevos lo siguen.
- [ ] **Versiones fijas de los ejemplos**: sin lockfile, cada prueba instala la última versión de cada framework. Es bueno para detectar roturas nuevas, pero conviene tener también una prueba con versiones fijas para distinguir "rompimos algo" de "el framework cambió".
- [ ] **Revisar el arreglo de SvelteKit** (`kit.version.name` fijo): el problema de los dos nombres distintos aparecía con la unidad `e:` en minúscula en Windows. Confirmar si es un error conocido de SvelteKit y si se corrige en versiones nuevas.

### Nombre del proyecto
- [ ] **Terminar el cambio de `todo2todo` a `haruplatforms`**: en `package.json` (nombre y comando), mensajes de la CLI, comentarios de las plantillas, la carpeta `~/.todo2todo/jdk-21` (en Linux/WSL) y el archivo `todo2todo-routes.json`.

### Hoja de ruta (servicio en la nube)
- [ ] Worker en Docker que ejecute el motor y una web mínima: subir un zip o un repo de GitHub y descargar el `.exe` / `.apk`.
- [ ] Workers con macOS para generar Mac e iOS.
- [ ] Corrección asistida de errores de compilación, explicada en lenguaje simple.
- [ ] Cuentas de usuario y pagos.

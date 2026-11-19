# todo2todo

Convierte un proyecto web JavaScript en una app de escritorio (Electron) o móvil (Capacitor), sin modificar el código original.

## Uso

```bash
npm install
npm run build

# ¿Es compatible mi proyecto?
node dist/cli.js analyze ../mi-proyecto

# Generar instalador de Windows + app Android
node dist/cli.js build ../mi-proyecto -t windows,android -n "Mi App" --id com.miempresa.miapp -i icono.png
```

Durante el desarrollo se puede usar `npm run dev -- <comando>` (ejecuta el TypeScript directamente con tsx).

Plataformas: `windows`, `mac`, `linux`, `android`, `ios`. Los resultados quedan en `out/<id>/`.

## Cómo funciona

```
detectar → copiar a .work/source → compilar web → empaquetar
```

1. **Análisis** ([src/pipeline.ts](src/pipeline.ts), [src/project.ts](src/project.ts)): detecta el framework, revisa problemas (p.ej. URLs a `localhost`) y los explica en lenguaje simple.
2. **Adaptador** ([src/adapters/](src/adapters/)): uno por framework. Instala dependencias y compila a un sitio estático. Se registran en [src/adapters/index.ts](src/adapters/index.ts).
3. **Destinos** ([src/targets/](src/targets/)):
   - **Escritorio**: plantilla Electron ([templates/electron/](templates/electron/)) que sirve la app por el protocolo `app://`, de modo que las rutas absolutas y el router en modo history funcionan sin tocar el proyecto. Instaladores con electron-builder.
   - **Móvil**: proyecto Capacitor. Compila el APK si encuentra el Android SDK; iOS genera el proyecto Xcode (compilar requiere macOS). En Android se reemplaza `MainActivity` ([templates/android/MainActivity.java](templates/android/MainActivity.java)) para que los sitios multipágina sirvan `/acerca` desde `acerca.html`, ya que Capacitor responde `index.html` a toda ruta sin extensión.

## Compatibilidad actual

| Framework | Estado | Qué se adapta en la copia |
|---|---|---|
| Vite (React, Vue, Svelte, Solid, Preact, Lit) | ✅ | `--base /`; se omite el chequeo de tipos |
| Create React App | ✅ | `PUBLIC_URL=/` (ignora `homepage`), advertencias de ESLint no bloquean |
| Angular | ✅ | `angular.json`: sin SSR/prerender/budgets, `baseHref` `/` |
| Next.js | ✅ | `next.config` envuelto: `output: 'export'`, imágenes sin optimizar, sin PPR; se quitan rutas de API y middleware |
| Nuxt | ✅ | `nuxt.config` envuelto: `baseURL` `/`; `nuxt generate` |
| SvelteKit, Remix, Astro, Gatsby | Detectado, pendiente | |

Next.js: el análisis marca como bloqueantes `getServerSideProps`, Server Actions, `cookies()`/`headers()` y rutas dinámicas sin `generateStaticParams`/`getStaticPaths`.

## Requisitos para compilar

- Node 20+
- Android: Android Studio / Android SDK (`ANDROID_HOME`) y JDK 21
- Mac e iOS: macOS con Xcode

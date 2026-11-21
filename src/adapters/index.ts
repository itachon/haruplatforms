import type { Adapter, Project } from '../types.js';
import { hasDep } from '../project.js';
import { angularAdapter } from './angular.js';
import { astroAdapter } from './astro.js';
import { craAdapter } from './cra.js';
import { gatsbyAdapter } from './gatsby.js';
import { nextAdapter } from './next.js';
import { nuxtAdapter } from './nuxt.js';
import { reactRouterAdapter } from './react-router.js';
import { sveltekitAdapter } from './sveltekit.js';
import { viteAdapter } from './vite.js';

/**
 * El orden importa: Nuxt, SvelteKit, React Router y Astro usan Vite, y Gatsby
 * usa React, así que deben revisarse antes que los adaptadores genéricos.
 */
export const adapters: Adapter[] = [
  nextAdapter,
  nuxtAdapter,
  sveltekitAdapter,
  reactRouterAdapter,
  astroAdapter,
  gatsbyAdapter,
  angularAdapter,
  craAdapter,
  viteAdapter,
];

export const SUPPORTED_SUMMARY =
  'Por ahora se admiten Next.js, Nuxt, SvelteKit, React Router 7, Astro, Gatsby, Angular, Create React App y proyectos con Vite (React, Vue, Svelte, Solid, Preact, Lit).';

/** Frameworks que reconocemos pero aún no convertimos, con qué hacer mientras tanto. */
const PLANNED: [dep: string, label: string, hint: string][] = [
  [
    '@remix-run/react',
    'Remix 2',
    'Remix continúa como React Router 7, que sí es compatible. Puedes actualizar con: npx codemod remix/2/react-router/upgrade',
  ],
];

export type Detection =
  | { kind: 'supported'; adapter: Adapter; label: string }
  | { kind: 'planned'; label: string; hint: string }
  | { kind: 'unknown' };

export function detect(project: Project): Detection {
  // Un proyecto a medio migrar puede tener ambas dependencias: manda la nueva.
  const planned = hasDep(project, '@react-router/dev') ? undefined : PLANNED.find(([dep]) => hasDep(project, dep));
  if (planned) return { kind: 'planned', label: planned[1], hint: planned[2] };
  const adapter = adapters.find((a) => a.detect(project));
  if (adapter) return { kind: 'supported', adapter, label: adapter.describe(project) };
  return { kind: 'unknown' };
}

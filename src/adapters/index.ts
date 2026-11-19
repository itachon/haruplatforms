import type { Adapter, Project } from '../types.js';
import { hasDep } from '../project.js';
import { angularAdapter } from './angular.js';
import { craAdapter } from './cra.js';
import { nextAdapter } from './next.js';
import { nuxtAdapter } from './nuxt.js';
import { viteAdapter } from './vite.js';

/** El orden importa: Nuxt usa Vite, así que debe revisarse antes. */
export const adapters: Adapter[] = [nextAdapter, nuxtAdapter, angularAdapter, craAdapter, viteAdapter];

export const SUPPORTED_SUMMARY =
  'Por ahora se admiten Next.js, Nuxt, Angular, Create React App y proyectos con Vite (React, Vue, Svelte, Solid, Preact, Lit).';

/**
 * Frameworks que reconocemos pero aún no convertimos. Se revisan antes que los
 * adaptadores porque varios (SvelteKit, Remix, Astro) también usan Vite.
 */
const PLANNED: [dep: string, label: string][] = [
  ['@sveltejs/kit', 'SvelteKit'],
  ['@remix-run/react', 'Remix'],
  ['@react-router/dev', 'React Router (modo framework)'],
  ['astro', 'Astro'],
  ['gatsby', 'Gatsby'],
];

export type Detection =
  | { kind: 'supported'; adapter: Adapter; label: string }
  | { kind: 'planned'; label: string }
  | { kind: 'unknown' };

export function detect(project: Project): Detection {
  const planned = PLANNED.find(([dep]) => hasDep(project, dep));
  if (planned) return { kind: 'planned', label: planned[1] };
  const adapter = adapters.find((a) => a.detect(project));
  if (adapter) return { kind: 'supported', adapter, label: adapter.describe(project) };
  return { kind: 'unknown' };
}

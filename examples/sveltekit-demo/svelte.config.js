import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    // Publicado en un subdirectorio (p.ej. GitHub Pages): la app debe ignorarlo.
    paths: { base: '/mi-sitio' },
    adapter: adapter(),
  },
};

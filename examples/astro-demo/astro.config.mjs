import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  // Publicado en un subdirectorio con servidor Node: la app debe ignorar ambos.
  base: '/mi-sitio',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});

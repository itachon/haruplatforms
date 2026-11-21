import type { Config } from '@react-router/dev/config';

export default {
  // Proyecto pensado para un servidor Node (SSR).
  ssr: true,
  basename: '/mi-sitio/',
} satisfies Config;

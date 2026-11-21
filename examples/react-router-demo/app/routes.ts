import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('acerca', 'routes/acerca.tsx'),
  route('productos/:id', 'routes/producto.tsx'),
  route('api/hola', 'routes/api.hola.ts'),
] satisfies RouteConfig;

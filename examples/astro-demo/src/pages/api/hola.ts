// Endpoint que responde en cada petición: solo existe en el servidor.
import { saludo } from '../../lib/saludo';

export const prerender = false;

export function GET() {
  return Response.json(saludo());
}

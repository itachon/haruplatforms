// Ruta de recurso (API): solo existe en el servidor.
export function loader() {
  return Response.json({ hola: 'mundo' });
}

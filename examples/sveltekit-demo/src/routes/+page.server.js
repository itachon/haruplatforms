// Corre en el servidor: al generar la app se ejecuta una vez y se guarda el resultado.
export async function load({ fetch }) {
  const res = await fetch('/api/hola');
  return { hola: (await res.json()).hola };
}

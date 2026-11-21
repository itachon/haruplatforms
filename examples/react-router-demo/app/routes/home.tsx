import { Link, useLoaderData, useNavigate } from 'react-router';

// Corre en el servidor: al generar la app se ejecuta una vez y se guarda el resultado.
export async function loader() {
  return { hola: 'mundo' };
}

export default function Home() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  return (
    <div>
      <h1>Inicio (React Router)</h1>
      <p id="api">API: {data.hola}</p>
      <Link to="/productos/1">Producto 1</Link>
      <button id="ir-99" onClick={() => navigate('/productos/99')}>
        Producto 99
      </button>
    </div>
  );
}

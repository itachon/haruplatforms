import * as React from 'react';
import Layout from '../../components/layout';

// Ruta de solo cliente: sirve para cualquier id, sin generar cada página.
// Su HTML se genera sin id, así que el id se muestra tras montar el componente
// (si no, React avisa que el HTML no coincide al hidratar).
export default function Producto({ params }) {
  const [id, setId] = React.useState('');
  React.useEffect(() => setId(params.id), [params.id]);
  return (
    <Layout>
      <h1>Producto {id}</h1>
    </Layout>
  );
}

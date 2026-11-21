import * as React from 'react';
import { graphql, Link, navigate } from 'gatsby';
import Layout from '../components/layout';

export const query = graphql`
  query {
    saludo {
      hola
    }
  }
`;

export default function Inicio({ data }) {
  return (
    <Layout>
      <h1>Inicio (Gatsby)</h1>
      <p id="api">API: {data.saludo.hola}</p>
      <Link to="/productos/1/">Producto 1</Link>
      <button id="ir-99" onClick={() => navigate('/productos/99/')}>
        Producto 99
      </button>
    </Layout>
  );
}

export const Head = () => <title>Gatsby demo</title>;

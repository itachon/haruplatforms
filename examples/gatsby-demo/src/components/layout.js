import * as React from 'react';
import { Link } from 'gatsby';

export default function Layout({ children }) {
  return (
    <>
      <nav>
        <Link to="/">Inicio</Link> <Link to="/acerca/">Acerca</Link>
      </nav>
      {children}
    </>
  );
}

import { useParams } from 'react-router';

export default function Producto() {
  const { id } = useParams();
  return <h1>Producto {id}</h1>;
}

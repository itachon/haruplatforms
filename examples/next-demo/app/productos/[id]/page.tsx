export function generateStaticParams() {
  return [{ id: "1" }, { id: "2" }];
}

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <h1>Producto {id}</h1>
    </main>
  );
}

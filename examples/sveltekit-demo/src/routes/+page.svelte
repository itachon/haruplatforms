<script>
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  let { data } = $props();
</script>

<h1>Inicio (SvelteKit)</h1>
<p id="api">API: {data.hola}</p>
<a href="{base}/productos/1">Producto 1</a>
<button id="ir-99" onclick={() => goto(`${base}/productos/99`)}>Producto 99</button>

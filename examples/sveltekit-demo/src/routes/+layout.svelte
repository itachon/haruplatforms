<script>
  import { base } from '$app/paths';
  let { children } = $props();
</script>

<nav>
  <a href="{base}/">Inicio</a>
  <a href="{base}/acerca">Acerca</a>
</nav>
{@render children()}

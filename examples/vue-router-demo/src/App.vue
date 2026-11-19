<script setup lang="ts">
const API_URL = 'http://localhost:3000/api'
const platform = (window as any).todo2todo?.platform ?? 'navegador'
</script>

<template>
  <header>
    <h1>Demo todo2todo</h1>
    <p>Ejecutándose en: <strong>{{ platform }}</strong></p>
    <nav>
      <RouterLink to="/">Inicio</RouterLink> |
      <RouterLink to="/usuarios/5">Usuario 5</RouterLink>
    </nav>
    <small>API: {{ API_URL }}</small>
  </header>
  <main><RouterView /></main>
</template>

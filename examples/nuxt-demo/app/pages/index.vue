<script setup lang="ts">
// Datos de server/api: Nuxt los captura al generar el sitio.
const { data } = await useFetch('/api/hola')
</script>

<template>
  <div>
    <h1>Inicio (Nuxt)</h1>
    <p id="api">API: {{ data?.hola }}</p>
    <NuxtLink to="/productos/1">Producto 1</NuxtLink>
    <button id="ir-99" @click="navigateTo('/productos/99')">Producto 99</button>
  </div>
</template>

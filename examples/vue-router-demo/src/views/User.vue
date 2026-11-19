<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <section>
    <h2>Usuario {{ route.params.id }}</h2>
    <p>Ruta anidada con history mode: recarga la página (Ctrl+R) para probar el fallback.</p>
  </section>
</template>

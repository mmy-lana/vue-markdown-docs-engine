<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="min-h-dvh p-8 bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <h1 class="text-2xl font-bold tracking-tight">VueDocs.Engine</h1>
    <p class="mt-2 text-slate-600 dark:text-slate-400">
      Active document slug: {{ route.params['slug'] || 'getting-started' }}
    </p>
  </div>
</template>

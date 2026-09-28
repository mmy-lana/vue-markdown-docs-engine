<script setup lang="ts">
import BaseBadge from '@/components/ui/BaseBadge.vue';

/**
 * The document's position in the documentation hierarchy.
 *
 * Marked up as a real `nav` + `ol` trail: assistive technology announces the
 * depth, and the final crumb carries `aria-current="page"`.
 */
defineProps<{
  /** Top-level group the document belongs to. */
  category: string;
  /** Title of the current document. */
  title: string;
}>();
</script>

<template>
  <nav aria-label="Breadcrumb" class="min-w-0">
    <ol
      class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 dark:text-slate-400"
    >
      <li class="flex items-center gap-2">
        <router-link
          to="/"
          class="rounded transition-colors hover:text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Docs
        </router-link>
        <span aria-hidden="true" class="text-slate-300 dark:text-slate-600">/</span>
      </li>

      <li class="flex min-w-0 items-center gap-2">
        <BaseBadge tone="brand" size="sm">{{ category }}</BaseBadge>
        <span aria-hidden="true" class="text-slate-300 dark:text-slate-600">/</span>
      </li>

      <li class="min-w-0">
        <span
          aria-current="page"
          class="block truncate font-medium text-slate-700 dark:text-slate-200"
        >
          {{ title }}
        </span>
      </li>
    </ol>
  </nav>
</template>

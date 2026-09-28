<script setup lang="ts">
import { computed } from 'vue';
import { useDocNavigation } from '@/composables/useDocNavigation';
import type { PagerLinks } from '@/composables/useDocNavigation';

/**
 * Previous and next document links, ordered by the same sequence the sidebar
 * renders. Sequential reading is the dominant way a documentation set is
 * consumed, so both ends are always offered when they exist.
 */
const props = defineProps<{
  /** Slug of the document the pager is anchored to. */
  slug: string;
}>();

const { getPager } = useDocNavigation();

const pager = computed<PagerLinks>(() => getPager(props.slug));

/** `true` at the very start or the very end of the corpus. */
const isAtBoundary = computed<boolean>(
  () => pager.value.prev === null && pager.value.next === null
);
</script>

<template>
  <nav aria-label="Document pagination" class="grid gap-3 sm:grid-cols-2">
    <router-link
      v-if="pager.prev"
      :to="`/docs/${pager.prev.slug}`"
      class="group flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 transition-colors hover:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-800 dark:hover:border-brand-500"
    >
      <svg
        aria-hidden="true"
        class="size-5 shrink-0 text-slate-400 transition-transform group-hover:-translate-x-0.5 dark:text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      <span class="min-w-0">
        <span class="block text-xs text-slate-500 dark:text-slate-400">Previous</span>
        <span class="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {{ pager.prev.title }}
        </span>
      </span>
    </router-link>

    <router-link
      v-if="pager.next"
      :to="`/docs/${pager.next.slug}`"
      class="group flex min-h-11 items-center justify-end gap-3 rounded-lg border border-slate-200 px-4 py-3 text-right transition-colors hover:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-800 dark:hover:border-brand-500 sm:col-start-2"
    >
      <span class="min-w-0">
        <span class="block text-xs text-slate-500 dark:text-slate-400">Next</span>
        <span class="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {{ pager.next.title }}
        </span>
      </span>
      <svg
        aria-hidden="true"
        class="size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </router-link>

    <p
      v-if="isAtBoundary"
      class="col-span-full py-2 text-center text-sm text-slate-500 dark:text-slate-400"
    >
      {{ pager.prev ? 'You have reached the first document.' : 'You have reached the last document.' }}
    </p>
  </nav>
</template>

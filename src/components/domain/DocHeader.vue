<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';
import BaseKbd from '@/components/ui/BaseKbd.vue';

/**
 * The application header.
 *
 * Sticky, and the single place every global control lives. At the narrowest
 * supported width the search button collapses to its icon and the edit button
 * drops its label, so the row still fits inside 360px without the page ever
 * scrolling horizontally.
 */
const emit = defineEmits<{
  (event: 'toggle-nav'): void;
  (event: 'open-search'): void;
  (event: 'open-editor'): void;
}>();

const { isDark, toggleTheme } = useTheme();
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white/80 px-3 backdrop-blur-md sm:px-6 dark:border-slate-800 dark:bg-slate-950/80"
  >
    <div class="flex min-w-0 items-center gap-1 sm:gap-2">
      <button
        type="button"
        class="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Open sidebar navigation"
        aria-controls="docs-navigation"
        data-testid="nav-toggle"
        @click="emit('toggle-nav')"
      >
        <svg
          aria-hidden="true"
          class="size-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <router-link
        to="/"
        class="inline-flex min-h-11 min-w-0 items-center truncate rounded text-base font-bold tracking-tight text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:text-lg dark:text-white"
      >
        VueDocs<span class="text-brand-500">.Engine</span>
      </router-link>
    </div>

    <div class="flex shrink-0 items-center gap-1 sm:gap-2">
      <button
        type="button"
        class="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-2.5 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-3 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200"
        aria-label="Search documentation"
        data-testid="search-toggle"
        @click="emit('open-search')"
      >
        <svg
          aria-hidden="true"
          class="size-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span class="hidden md:inline">Search docs...</span>
        <BaseKbd class="hidden md:inline-block">⌘K</BaseKbd>
      </button>

      <button
        type="button"
        class="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-slate-700 transition-colors hover:text-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:px-3 dark:text-slate-200"
        aria-label="Edit or create document"
        data-testid="editor-toggle"
        @click="emit('open-editor')"
      >
        <span class="hidden sm:inline">Edit / New</span>
        <span class="sm:hidden">Edit</span>
      </button>

      <button
        type="button"
        class="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        :aria-pressed="isDark"
        data-testid="theme-toggle"
        @click="toggleTheme"
      >
        <!--
          Inset outline icons rather than pictographic characters. The glyphs
          are decorative, so the accessible name lives on the button; the
          stroke inherits currentColor and therefore follows the theme.
        -->
        <svg
          v-if="isDark"
          aria-hidden="true"
          class="size-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            stroke-linecap="round"
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"
          />
        </svg>
        <svg
          v-else
          aria-hidden="true"
          class="size-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
          />
        </svg>
      </button>
    </div>
  </header>
</template>

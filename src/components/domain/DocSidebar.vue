<script setup lang="ts">
import { useDocNavigation } from '@/composables/useDocNavigation';

/**
 * The document navigation rail.
 *
 * Rendered inside a fixed column on `lg` and above. Below that the layout
 * slides the same markup in as a drawer, so the navigation is written once
 * and the two presentations differ only in positioning.
 */
defineProps<{
  /** Whether the drawer presentation is active below the `lg` breakpoint. */
  isDrawerOpen: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const { groups, currentSlug } = useDocNavigation();
</script>

<template>
  <nav aria-label="Documentation" class="flex h-full min-h-0 flex-col">
    <div
      v-if="isDrawerOpen"
      class="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 dark:border-slate-800 lg:hidden"
    >
      <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">Navigation</span>
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        aria-label="Close navigation"
        data-testid="sidebar-close"
        @click="emit('close')"
      >
        <svg
          aria-hidden="true"
          class="size-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      <p
        v-if="groups.length === 0"
        class="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        No documents have been published yet.
      </p>

      <div v-for="group in groups" :key="group.id" class="mb-6 last:mb-0">
        <h2
          class="mb-2 px-3 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400"
        >
          {{ group.name }}
        </h2>

        <ul class="space-y-0.5">
          <li v-for="item in group.items" :key="item.id">
            <router-link
              :to="`/docs/${item.slug}`"
              :aria-current="item.slug === currentSlug ? 'page' : undefined"
              :data-testid="`nav-${item.slug}`"
              class="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              :class="
                item.slug === currentSlug
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-100'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              "
              @click="emit('close')"
            >
              <span class="truncate">{{ item.title }}</span>
            </router-link>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

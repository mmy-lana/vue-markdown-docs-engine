<script setup lang="ts">
import { useRoute } from 'vue-router';
import type { DocHeading } from '@/types';

/**
 * The document's table of contents, shown as a sticky right rail from the
 * `xl` breakpoint up. Below that the same data is rendered by
 * `MobileTocAccordion`.
 *
 * Nesting reflects heading depth: a level 3 heading is indented under the
 * level 2 heading above it. The active heading is marked with
 * `aria-current="location"` rather than colour alone.
 */
withDefaults(
  defineProps<{
    /** Headings in document order, as stored with the document. */
    headings: readonly DocHeading[];
    /** Id of the heading currently in view. */
    activeId: string;
  }>(),
  { activeId: '' }
);

/** Indentation applied per heading level, relative to level 2. */
const levelIndent: Record<DocHeading['level'], string> = {
  2: 'pl-0',
  3: 'pl-3',
  4: 'pl-6'
};

const route = useRoute();

/**
 * Heading links stay on the current document and only change the hash, so the
 * router's `scrollBehavior` performs the smooth scroll instead of a full
 * navigation that would reset the sidebar.
 */
function headingTarget(anchor: string): { path: string; hash: string } {
  const slug = route.params['slug'];
  return { path: `/docs/${typeof slug === 'string' ? slug : ''}`, hash: `#${anchor}` };
}
</script>

<template>
  <nav v-if="headings.length > 0" aria-label="On this page" class="text-sm">
    <ul class="space-y-0.5 border-l border-slate-200 dark:border-slate-800">
      <li v-for="heading in headings" :key="heading.id">
        <router-link
          :to="headingTarget(heading.id)"
          :aria-current="heading.id === activeId ? 'location' : undefined"
          class="-ml-px flex min-h-11 items-center border-l-2 py-1.5 pr-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :class="[
            levelIndent[heading.level],
            heading.id === activeId
              ? 'border-brand-500 font-medium text-brand-600 dark:text-brand-500'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100'
          ]"
        >
          <span class="line-clamp-2">{{ heading.text }}</span>
        </router-link>
      </li>
    </ul>
  </nav>

  <p v-else class="text-sm text-slate-500 dark:text-slate-400">
    This document has no sections.
  </p>
</template>

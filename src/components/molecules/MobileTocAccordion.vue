<script lang="ts">
import BaseBadge from '@/components/ui/BaseBadge.vue';
</script>

<script setup lang="ts">
import { ref, useId, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { DocHeading } from '@/types';

/**
 * The table of contents as a disclosure, for viewports below `xl` where the
 * sticky right rail is not rendered.
 *
 * Opens itself the moment a heading becomes active, so tapping a heading from
 * a search result or a deep link reveals where the reader landed instead of
 * leaving the list collapsed.
 */
const props = withDefaults(
  defineProps<{
    /** Headings in document order, as stored with the document. */
    headings: readonly DocHeading[];
    /** Id of the heading currently in view. */
    activeId: string;
  }>(),
  { activeId: '' }
);

const isExpanded = ref(false);
const panelId = useId();
const route = useRoute();

const levelIndent: Record<DocHeading['level'], string> = {
  2: 'pl-0',
  3: 'pl-3',
  4: 'pl-6'
};

function headingTarget(anchor: string): { path: string; hash: string } {
  const slug = route.params['slug'];
  return { path: `/docs/${typeof slug === 'string' ? slug : ''}`, hash: `#${anchor}` };
}

// Navigating to another document resets the panel, but a plain hash change
// keeps the reader's expanded state.
watch(
  () => route.params['slug'],
  () => {
    isExpanded.value = false;
  }
);

watch(
  () => props.activeId,
  (activeId) => {
    if (activeId.length > 0) {
      isExpanded.value = true;
    }
  }
);

function toggle(): void {
  isExpanded.value = !isExpanded.value;
}
</script>

<template>
  <div
    v-if="headings.length > 0"
    class="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800"
  >
    <button
      type="button"
      class="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:text-slate-100 dark:hover:bg-slate-800"
      :aria-expanded="isExpanded"
      :aria-controls="panelId"
      @click="toggle"
    >
      <span>On this page</span>
      <span class="flex items-center gap-2">
        <BaseBadge tone="neutral" size="sm">{{ headings.length }}</BaseBadge>
        <svg
          aria-hidden="true"
          class="size-4 text-slate-400 transition-transform duration-150"
          :class="isExpanded ? 'rotate-180' : ''"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </button>

    <div v-show="isExpanded" :id="panelId" class="border-t border-slate-200 dark:border-slate-800">
      <ul class="max-h-[50dvh] space-y-0.5 overflow-y-auto p-2">
        <li v-for="heading in headings" :key="heading.id">
          <router-link
            :to="headingTarget(heading.id)"
            :aria-current="heading.id === activeId ? 'location' : undefined"
            class="flex min-h-11 items-center rounded-md py-1.5 pr-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            :class="[
              levelIndent[heading.level],
              heading.id === activeId
                ? 'bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-500'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            ]"
            @click="isExpanded = false"
          >
            <span class="line-clamp-2">{{ heading.text }}</span>
          </router-link>
        </li>
      </ul>
    </div>
  </div>
</template>

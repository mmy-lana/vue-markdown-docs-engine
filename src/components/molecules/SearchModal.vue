<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { useRouter } from 'vue-router';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseKbd from '@/components/ui/BaseKbd.vue';
import { useDocSearch } from '@/composables/useDocSearch';
import { useDocStorage } from '@/composables/useDocStorage';
import type { SearchResult } from '@/types';

/**
 * The command-palette style search dialog.
 *
 * Implements the combobox pattern: focus stays in the text field while
 * `aria-activedescendant` moves a virtual cursor through the result list, so
 * arrow keys never steal focus from the input.
 */

/** Imperative handle exposed by `BaseInput` for programmatic focus. */
type BaseInputHandle = { focus: () => void };

const props = defineProps<{
  /** Whether the palette is mounted and interactive. */
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
}>();

const router = useRouter();
const { query, searchResults, hasNoResults } = useDocSearch();
const { addRecentSearch, recentSearches } = useDocStorage();

const listboxId: string = useId();
const searchInput = ref<BaseInputHandle | null>(null);
const activeIndex = ref(-1);

/** The rows the user can currently move through. */
const visibleItems = computed<SearchResult[]>(() => searchResults.value);

/** Recent searches stand in for the result list while the query is empty. */
const showRecentSearches = computed<boolean>(
  () => query.value.trim().length === 0 && recentSearches.value.length > 0
);

/** `true` when a settled query returned nothing. */
const showNoResults = computed<boolean>(
  () => !showRecentSearches.value && hasNoResults.value
);

const statusMessage = computed<string>(() => {
  if (showRecentSearches.value) {
    return `${recentSearches.value.length} recent ${recentSearches.value.length === 1 ? 'search' : 'searches'}`;
  }
  const count = visibleItems.value.length;
  if (count === 0) return 'No results';
  return `${count} ${count === 1 ? 'result' : 'results'}`;
});

const activeDescendant = computed<string | undefined>(() => {
  if (activeIndex.value < 0 || activeIndex.value >= visibleItems.value.length) return undefined;
  return `${listboxId}-option-${activeIndex.value}`;
});

function resetState(): void {
  query.value = '';
  activeIndex.value = -1;
}

function clampActiveIndex(index: number, length: number): number {
  if (length === 0) return -1;
  return ((index % length) + length) % length;
}

function onQueryInput(): void {
  activeIndex.value = visibleItems.value.length > 0 ? 0 : -1;
}

function moveSelection(delta: number): void {
  const length = visibleItems.value.length;
  if (length === 0) return;
  activeIndex.value = clampActiveIndex(activeIndex.value + delta, length);
}

function openResult(result: SearchResult, term: string): void {
  addRecentSearch(term);
  emit('close');
  void router.push({
    path: `/docs/${result.slug}`,
    hash: result.anchor !== undefined ? `#${result.anchor}` : ''
  });
}

function openRecentSearch(term: string): void {
  addRecentSearch(term);
  query.value = term;
}

function onEnter(): void {
  const term = query.value.trim();
  if (term.length === 0) return;

  if (showRecentSearches.value) {
    openRecentSearch(recentSearches.value[0] ?? term);
    return;
  }

  const result = visibleItems.value[activeIndex.value];
  if (result !== undefined) {
    openResult(result, term);
    return;
  }

  // No row is active: fall back to the top hit so Enter always does something
  // predictable rather than nothing.
  const best = visibleItems.value[0];
  if (best !== undefined) {
    openResult(best, term);
  }
}

function onKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveSelection(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveSelection(-1);
      break;
    case 'Home':
      if (visibleItems.value.length > 0) {
        event.preventDefault();
        activeIndex.value = 0;
      }
      break;
    case 'End':
      if (visibleItems.value.length > 0) {
        event.preventDefault();
        activeIndex.value = visibleItems.value.length - 1;
      }
      break;
    default:
      break;
  }
}

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (!isOpen) {
      resetState();
      return;
    }
    // `flush: 'post'` runs after the dialog has taken initial focus, so the
    // palette's own field ends up focused rather than the close button.
    await nextTick();
    searchInput.value?.focus();
  },
  { flush: 'post' }
);

// A settled query invalidates the previous cursor position.
watch(visibleItems, () => {
  activeIndex.value = visibleItems.value.length > 0 ? 0 : -1;
});
</script>

<template>
  <BaseModal
    :is-open="isOpen"
    aria-label="Search documentation"
    labelled-by="search-modal-title"
    @close="emit('close')"
  >
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="border-b border-slate-200 px-4 py-4 pr-16 dark:border-slate-800">
        <h2 id="search-modal-title" class="sr-only">Search documentation</h2>
        <BaseInput
          ref="searchInput"
          v-model="query"
          id="search-modal-input"
          label="Search documentation"
          type="search"
          placeholder="Search titles, sections and body text..."
          leading-icon="search"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="visibleItems.length > 0 || showRecentSearches"
          :aria-controls="listboxId"
          :aria-activedescendant="activeDescendant"
          data-testid="search-input"
          @update:model-value="onQueryInput"
          @keydown="onKeydown"
          @enter="onEnter"
        />
      </div>

      <p class="sr-only" role="status" aria-live="polite">{{ statusMessage }}</p>

      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <ul
          v-if="visibleItems.length > 0"
          :id="listboxId"
          role="listbox"
          aria-label="Search results"
          class="space-y-1"
        >
          <li v-for="(result, index) in visibleItems" :key="result.docId + (result.anchor ?? '')">
            <button
              :id="`${listboxId}-option-${index}`"
              type="button"
              role="option"
              :aria-selected="index === activeIndex"
              :data-testid="`search-result-${index}`"
              class="flex min-h-11 w-full flex-col items-start gap-1 rounded-lg px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              :class="
                index === activeIndex
                  ? 'bg-brand-50 dark:bg-brand-500/10'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              "
              @click="openResult(result, query.trim())"
              @mousemove="activeIndex = index"
            >
              <span class="flex w-full items-center gap-2">
                <span
                  class="truncate text-sm font-medium text-slate-900 dark:text-slate-100"
                  :class="result.anchor ? '' : 'text-brand-600 dark:text-brand-500'"
                >
                  {{ result.title }}
                </span>
                <BaseBadge tone="neutral" size="sm" class="ml-auto shrink-0">
                  {{ result.category }}
                </BaseBadge>
              </span>
              <span class="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                {{ result.matchedText }}
              </span>
            </button>
          </li>
        </ul>

        <div
          v-else-if="showRecentSearches"
          :id="listboxId"
          role="listbox"
          aria-label="Recent searches"
          class="space-y-1"
        >
          <p class="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Recent searches
          </p>
          <button
            v-for="(term, index) in recentSearches"
            :id="`${listboxId}-option-${index}`"
            :key="term"
            type="button"
            role="option"
            :aria-selected="false"
            :data-testid="`recent-search-${index}`"
            class="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="openRecentSearch(term)"
          >
            <svg
              aria-hidden="true"
              class="size-4 shrink-0 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {{ term }}
          </button>
        </div>

        <div
          v-else-if="showNoResults"
          class="flex flex-col items-center gap-2 px-4 py-12 text-center"
        >
          <svg
            aria-hidden="true"
            class="size-10 text-slate-300 dark:text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
            No results for “{{ query.trim() }}”
          </p>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Try a different term, or search for a category such as “Core Concepts”.
          </p>
        </div>

        <div v-else class="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <svg
            aria-hidden="true"
            class="size-10 text-slate-300 dark:text-slate-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-200">
            Search the documentation
          </p>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Matches titles, section headings and body text.
          </p>
        </div>
      </div>

      <div
        class="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"
      >
        <span class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <BaseKbd>↑</BaseKbd>
            <BaseKbd>↓</BaseKbd>
            <span>navigate</span>
          </span>
          <span class="flex items-center gap-1">
            <BaseKbd>↵</BaseKbd>
            <span>open</span>
          </span>
        </span>
        <span class="flex items-center gap-1">
          <BaseKbd>esc</BaseKbd>
          <span>close</span>
        </span>
      </div>
    </div>
  </BaseModal>
</template>

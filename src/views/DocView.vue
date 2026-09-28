<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import DocsLayout from '@/layouts/DocsLayout.vue';
import Breadcrumb from '@/components/molecules/Breadcrumb.vue';
import DocPager from '@/components/molecules/DocPager.vue';
import TableOfContents from '@/components/molecules/TableOfContents.vue';
import MobileTocAccordion from '@/components/molecules/MobileTocAccordion.vue';
import DocContentRenderer from '@/components/domain/DocContentRenderer.vue';
import { useDocNavigation } from '@/composables/useDocNavigation';
import { useMarkdownParser } from '@/composables/useMarkdownParser';
import { useTableOfContents } from '@/composables/useTableOfContents';
import type { CompiledDoc } from '@/types';

/**
 * Renders a single document.
 *
 * Compilation is asynchronous, so a request counter guards against a slow
 * compile for a previous document landing after the reader has already moved
 * on. The previously compiled document stays on screen while the next one
 * loads rather than flashing an empty page.
 */

const route = useRoute();
const { activeDoc, currentSlug } = useDocNavigation();
const { compileDoc, isCompiling } = useMarkdownParser();
const { activeHeadingId, initObserver, cleanupObserver } = useTableOfContents();

const compiled = ref<CompiledDoc | null>(null);
const compileError = ref<string | null>(null);
let compileRequestId = 0;

/**
 * `true` only until the first refresh settles, whatever the outcome.
 *
 * Cleared on every terminal path, including the one where the route names a
 * document that does not exist. Leaving it set would strand the view on the
 * loading state forever for any unknown slug.
 */
const isInitialLoad = ref(true);

async function refreshDocument(): Promise<void> {
  const requestId = ++compileRequestId;

  if (activeDoc.value === null) {
    compiled.value = null;
    compileError.value = null;
    isInitialLoad.value = false;
    cleanupObserver();
    return;
  }

  try {
    const result = await compileDoc(activeDoc.value);
    if (requestId !== compileRequestId) return;

    compiled.value = result;
    compileError.value = null;
    isInitialLoad.value = false;

    await nextTick();
    initObserver(result.headings);

    // The router's scrollBehavior already handled this hash for in-app
    // navigation. This covers a deep link, where the document did not exist
    // yet when the router ran its scroll.
    const hash = route.hash;
    if (hash.length > 1) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (cause) {
    if (requestId !== compileRequestId) return;
    compiled.value = null;
    compileError.value =
      cause instanceof Error ? cause.message : 'This document could not be rendered.';
    isInitialLoad.value = false;
    cleanupObserver();
  }
}

watch(() => activeDoc.value, () => void refreshDocument(), { immediate: true });
</script>

<template>
  <DocsLayout>
    <div
      v-if="isInitialLoad || (isCompiling && compiled === null)"
      class="py-16 text-center"
      role="status"
      aria-live="polite"
      data-testid="doc-loading"
    >
      <svg
        aria-hidden="true"
        class="mx-auto size-8 animate-spin text-brand-500"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading document...</p>
    </div>

    <div
      v-else-if="compileError"
      class="rounded-xl border border-rose-300 bg-rose-50 p-6 dark:border-rose-500/40 dark:bg-rose-500/10"
      role="alert"
      data-testid="doc-error"
    >
      <h1 class="text-lg font-semibold text-rose-800 dark:text-rose-200">
        This document could not be rendered
      </h1>
      <p class="mt-1 font-mono text-sm break-words text-rose-700 dark:text-rose-300">
        {{ compileError }}
      </p>
    </div>

    <div
      v-else-if="compiled === null"
      class="py-16 text-center"
      data-testid="doc-not-found"
    >
      <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">Document not found</h1>
      <p class="mx-auto mt-2 max-w-md text-slate-600 dark:text-slate-400">
        The requested documentation page does not exist or was removed. Pick a topic from the
        navigation, or search for what you need.
      </p>
      <router-link
        to="/docs/getting-started"
        class="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        Back to getting started
      </router-link>
    </div>

    <article v-else class="min-w-0 break-words">
      <Breadcrumb :category="compiled.category" :title="compiled.title" />

      <header class="mt-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1
          class="text-3xl font-extrabold tracking-tight text-balance text-slate-900 sm:text-4xl dark:text-slate-100"
          data-testid="doc-title"
        >
          {{ compiled.title }}
        </h1>
        <p
          v-if="compiled.description"
          class="mt-3 text-lg text-slate-600 dark:text-slate-400"
        >
          {{ compiled.description }}
        </p>

        <div
          class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          <span>{{ compiled.readingTimeMinutes }} min read</span>
          <span aria-hidden="true">•</span>
          <span>Last modified {{ new Date(compiled.lastModified).toLocaleDateString() }}</span>
        </div>

        <div class="xl:hidden">
          <MobileTocAccordion
            class="mt-6"
            :headings="compiled.headings"
            :active-id="activeHeadingId"
          />
        </div>
      </header>

      <DocContentRenderer class="mt-8" :html="compiled.htmlContent" />

      <footer class="mt-12 border-t border-slate-200 pt-6 dark:border-slate-800">
        <DocPager :slug="currentSlug" />
      </footer>
    </article>

    <template #toc>
      <template v-if="compiled">
        <h2
          class="mb-4 text-xs font-semibold tracking-wider text-slate-900 uppercase dark:text-slate-100"
        >
          On this page
        </h2>
        <TableOfContents :headings="compiled.headings" :active-id="activeHeadingId" />
      </template>
      <p v-else class="text-sm text-slate-500 dark:text-slate-400">
        No table of contents for this document.
      </p>
    </template>
  </DocsLayout>
</template>

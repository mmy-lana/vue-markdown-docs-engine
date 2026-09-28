<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DocHeader from '@/components/domain/DocHeader.vue';
import DocSidebar from '@/components/domain/DocSidebar.vue';
import DocEditorModal from '@/components/domain/DocEditorModal.vue';
import SearchModal from '@/components/molecules/SearchModal.vue';
import { lockBodyScroll, unlockBodyScroll } from '@/composables/useBodyScrollLock';
import { useDocNavigation } from '@/composables/useDocNavigation';
import type { DocItem } from '@/types';

/**
 * The three column documentation shell.
 *
 * The sidebar is a fixed rail from `lg`, the table of contents a fixed rail
 * from `xl`, and the main column is inset to match. Below `lg` both rails
 * become overlays. Offsets live here rather than on the content so the
 * measure of the prose column stays independent of the rails' widths.
 */

const route = useRoute();
const router = useRouter();
const { activeDoc } = useDocNavigation();

const isNavOpen = ref(false);
const isSearchOpen = ref(false);
const isEditorOpen = ref(false);
const editingDocId = ref<string | null>(null);

/** The document being edited, resolved outside the modal for the open state. */
const editingDoc = computed<DocItem | null>(
  () => activeDoc.value !== null && editingDocId.value === activeDoc.value.id
    ? activeDoc.value
    : null
);

function openEditorForCurrentDoc(): void {
  editingDocId.value = activeDoc.value?.id ?? null;
  isEditorOpen.value = true;
}

/**
 * Takes the reader to whatever was just saved.
 *
 * Without this, publishing a new document leaves the reader on the page they
 * started from, with no confirmation that anything happened. Editing the
 * document already on screen is a no-op, so the redundant navigation is
 * skipped.
 */
function handleSaved(doc: DocItem): void {
  if (route.params['slug'] === doc.slug) return;
  void router.push(`/docs/${doc.slug}`);
}

watch(isNavOpen, (open) => {
  if (open) {
    lockBodyScroll();
  } else {
    unlockBodyScroll();
  }
});

/** Closes the drawer once the viewport grows past the breakpoint. */
function handleResize(): void {
  if (window.innerWidth >= 1024) {
    isNavOpen.value = false;
  }
}

/**
 * Global shortcuts. Registered on the window so the palette is reachable from
 * anywhere, including from inside another dialog.
 */
function handleGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    isSearchOpen.value = !isSearchOpen.value;
    return;
  }

  // A bare "/" focuses search, the convention every documentation site uses,
  // but only when the reader is not already typing into a field.
  if (event.key === '/' && !isEditorOpen.value && !isSearchOpen.value) {
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
    }
    event.preventDefault();
    isSearchOpen.value = true;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleGlobalKeydown);
}

onUnmounted(() => {
  if (typeof window === 'undefined') return;
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleGlobalKeydown);
  if (isNavOpen.value) {
    unlockBodyScroll();
  }
});
</script>

<template>
  <div class="min-h-dvh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <DocHeader
      @toggle-nav="isNavOpen = !isNavOpen"
      @open-search="isSearchOpen = true"
      @open-editor="openEditorForCurrentDoc"
    />

    <!--
      A single navigation rail, repositioned rather than duplicated.

      Rendering the sidebar twice, once for the fixed column and once for the
      drawer, would put two `nav` landmarks in the document with the same
      label and double every link in the accessibility tree.
    -->
    <Teleport to="body">
      <div
        v-if="isNavOpen"
        class="fixed inset-0 z-30 lg:hidden"
        aria-hidden="true"
        @click="isNavOpen = false"
      />
    </Teleport>

    <aside
      id="docs-navigation"
      class="fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white transition-transform duration-200 ease-out xl:w-72 lg:z-20 lg:translate-x-0 dark:border-slate-800 dark:bg-slate-950"
      :class="isNavOpen ? 'translate-x-0' : '-translate-x-full'"
      data-testid="sidebar-rail"
    >
      <div class="h-dvh pt-16 lg:h-[calc(100dvh-4rem)] lg:pt-0">
        <DocSidebar @close="isNavOpen = false" />
      </div>
    </aside>

    <main
      id="main-content"
      class="px-4 py-6 sm:px-6 lg:ml-64 lg:py-10 xl:ml-72 xl:mr-72"
    >
      <div class="mx-auto w-full max-w-3xl xl:max-w-none">
        <slot />
      </div>
    </main>

    <!-- Fixed table of contents rail, xl and up. -->
    <aside
      class="fixed inset-y-0 right-0 z-20 hidden w-72 border-l border-slate-200 pt-16 xl:block dark:border-slate-800"
      data-testid="toc-rail"
    >
      <div class="h-[calc(100dvh-4rem)] overflow-y-auto px-5 py-8">
        <slot name="toc" />
      </div>
    </aside>

    <SearchModal :is-open="isSearchOpen" @close="isSearchOpen = false" />

    <DocEditorModal
      :is-open="isEditorOpen"
      :doc-id="editingDoc?.id ?? null"
      @close="isEditorOpen = false"
      @saved="handleSaved"
    />
  </div>
</template>

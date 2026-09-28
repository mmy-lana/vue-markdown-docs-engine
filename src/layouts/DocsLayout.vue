<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
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

/** The navigation rail, used to move and contain focus while the drawer is up. */
const navRail = ref<HTMLElement | null>(null);

/** The control that opened the drawer, so focus can be handed back to it. */
let previouslyFocusedElement: HTMLElement | null = null;

/** Everything focusable inside the drawer, for the Tab loop. */
const DRAWER_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/** Drawer focusables that are actually rendered, in tab order. */
function getDrawerFocusableElements(): HTMLElement[] {
  const root = navRail.value;
  if (root === null) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true'
  );
}

/** The document being edited, resolved outside the modal for the open state. */
const editingDoc = computed<DocItem | null>(
  () => activeDoc.value !== null && editingDocId.value === activeDoc.value.id
    ? activeDoc.value
    : null
);

function openSearch(): void {
  isNavOpen.value = false;
  isSearchOpen.value = true;
}

function openEditorForCurrentDoc(): void {
  isNavOpen.value = false;
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

watch(isNavOpen, async (open) => {
  if (open) {
    previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    lockBodyScroll();
    await nextTick();
    getDrawerFocusableElements()[0]?.focus();
    return;
  }

  unlockBodyScroll();

  // The invoking control may have been unmounted while the drawer was open.
  if (previouslyFocusedElement?.isConnected === true) {
    previouslyFocusedElement.focus();
  }
  previouslyFocusedElement = null;
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
  if (isNavOpen.value) {
    if (event.key === 'Escape') {
      // The drawer is a modal overlay, so Escape dismisses it. Closing it
      // through the ref also releases the body scroll lock and returns focus.
      event.preventDefault();
      isNavOpen.value = false;
      return;
    }

    if (event.key === 'Tab') {
      // Without this, Tab walks out of the drawer and into content sitting
      // behind the scrim, which is visually obscured and unreachable.
      const focusable = getDrawerFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        navRail.value?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (active === null || !navRail.value?.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
  }

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
  previouslyFocusedElement = null;
});
</script>

<template>
  <div class="min-h-dvh bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <DocHeader
      @toggle-nav="isNavOpen = !isNavOpen"
      @open-search="openSearch"
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
        class="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-xs lg:hidden"
        role="presentation"
        aria-hidden="true"
        data-testid="nav-scrim"
        @click="isNavOpen = false"
      />
    </Teleport>

    <!--
      One rail, two presentations.

      Below `lg` this is an overlay drawer spanning the full viewport and
      supplying its own 64px header. From `lg` it becomes a fixed column
      starting strictly below the sticky header.

      Geometry is written out longhand as `top-0 bottom-0` rather than the
      `inset-y-0` shorthand. Tailwind v4 compiles that shorthand to the
      *logical* `inset-block: 0`, and the override below therefore depends on
      two things holding: that `lg:top-16` is emitted later in the stylesheet,
      and that the cascade resolves `top` and `inset-block-start` to the same
      property. Both are true today, and the cascade does give no precedence
      to logical properties, so the shorthand would work. It is spelled out
      anyway so the result is legible from the class list alone, and so it
      does not depend on the order Tailwind happens to emit utilities in.

      No explicit height is set. `top` and `bottom` together already define
      the height; adding a third constraint would leave `bottom` ignored in an
      otherwise over-constrained box.
    -->
    <aside
      id="docs-navigation"
      ref="navRail"
      tabindex="-1"
      class="fixed top-0 bottom-0 left-0 z-40 w-64 border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:top-16 lg:z-20 lg:translate-x-0 xl:w-72 dark:border-slate-800 dark:bg-slate-950"
      :class="isNavOpen ? 'translate-x-0' : '-translate-x-full'"
      data-testid="sidebar-rail"
    >
      <!--
        No top padding here. The offset is supplied by whichever presentation
        is active: the drawer's own header below `lg`, and the rail's
        `lg:top-16` above it. Padding both would double the gap.

        Height is inherited from the aside, which is positioned by its top and
        bottom edges. The bottom inset keeps the last navigation entry clear
        of the iOS home indicator on devices that report one.
      -->
      <div
        class="flex h-full flex-col pb-[env(safe-area-inset-bottom,0px)] lg:pb-0"
      >
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

    <!--
      Fixed table of contents rail, xl and up. Same geometry as the left rail:
      pinned below the header, filling the remainder of the viewport.
    -->
    <aside
      class="fixed top-16 right-0 bottom-0 z-20 hidden w-72 border-l border-slate-200 xl:block dark:border-slate-800"
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

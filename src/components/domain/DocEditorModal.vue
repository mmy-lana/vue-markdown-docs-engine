<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseTextarea from '@/components/ui/BaseTextarea.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import { useDocStorage, MAX_DOCUMENT_LENGTH } from '@/composables/useDocStorage';
import { useMarkdownParser } from '@/composables/useMarkdownParser';
import { extractFrontmatterSync, extractHeadingsSync } from '@/composables/useMarkdownParser';
import type { CompiledDoc, DocItem } from '@/types';

/**
 * The document composer.
 *
 * Below the `md` breakpoint the editor and the preview are two tabs, because
 * a 320px-wide split view is unusable. From `md` up they become two columns
 * and the tabs disappear entirely.
 *
 * The preview is generated from exactly the same compiler the document view
 * uses, so what the author sees while writing is what a reader will get.
 */

type EditorTab = 'write' | 'preview';

/** Tab order, shared by the tab bar and the roving tabindex. */
const EDITOR_TABS: readonly EditorTab[] = ['write', 'preview'];

const props = defineProps<{
  /** Whether the composer is mounted and interactive. */
  isOpen: boolean;
  /** Id of the document to edit, or `null` to compose a new one. */
  docId: string | null;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'saved', doc: DocItem): void;
  /** The id of a document that was just removed, for routing continuity. */
  (event: 'deleted', docId: string): void;
}>();

const { docs, saveDoc, deleteDoc } = useDocStorage();
const { compileDoc } = useMarkdownParser();

/** Idle time before the preview recompiles, in milliseconds. */
const PREVIEW_DEBOUNCE_MS = 300;

/** A starting point that is already valid, so the first save succeeds. */
function createStarterDocument(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    '---',
    'title: Untitled Document',
    'description: A short summary shown under the title.',
    'category: Getting Started',
    'order: 100',
    'slug: untitled-document',
    'tags: []',
    `lastModified: ${today}`,
    '---',
    '',
    '## Overview',
    '',
    'Explain what this document covers.',
    ''
  ].join('\n');
}

const content = ref<string>('');
const activeTab = ref<EditorTab>('write');
const preview = ref<CompiledDoc | null>(null);
const previewError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const isSaving = ref(false);
const isDeleteArmed = ref(false);

let previewTimer: ReturnType<typeof setTimeout> | undefined;
/** Guards against a slow compile overwriting the result of a newer one. */
let previewRequestId = 0;

const isEditingExisting = computed<boolean>(() => props.docId !== null);

const sourceDoc = computed<DocItem | null>(
  () => docs.value.find((doc) => doc.id === props.docId) ?? null
);

const dialogTitle = computed<string>(() =>
  isEditingExisting.value ? 'Edit document' : 'New document'
);

const canSave = computed<boolean>(() => content.value.trim().length > 0 && !isSaving.value);

function cancelPendingPreview(): void {
  if (previewTimer !== undefined) {
    clearTimeout(previewTimer);
    previewTimer = undefined;
  }
}

/**
 * Builds a throwaway `DocItem` from the editor buffer so the standard
 * compiler can run over it. Frontmatter problems surface as a message in the
 * preview pane rather than blanking the composer.
 */
function buildPreviewSource(raw: string): DocItem {
  const { frontmatter, body } = extractFrontmatterSync(raw);
  return {
    id: props.docId ?? 'preview',
    slug: frontmatter.slug,
    title: frontmatter.title,
    description: frontmatter.description,
    category: frontmatter.category,
    order: frontmatter.order,
    rawContent: raw,
    headings: extractHeadingsSync(body),
    tags: frontmatter.tags,
    lastModified: frontmatter.lastModified,
    updatedAt: 0,
    isDraft: false
  };
}

async function refreshPreview(): Promise<void> {
  const requestId = ++previewRequestId;
  const raw = content.value;

  if (raw.trim().length === 0) {
    preview.value = null;
    previewError.value = null;
    return;
  }

  // The preview runs the full compiler over the buffer on every pause. A
  // document that could never be saved must not be compiled either, or the
  // composer stalls on exactly the input the author is trying to remove.
  if (raw.length > MAX_DOCUMENT_LENGTH) {
    preview.value = null;
    previewError.value = `Preview is disabled: the document exceeds the ${MAX_DOCUMENT_LENGTH / 1024} KB limit and cannot be saved.`;
    return;
  }

  let source: DocItem;
  try {
    source = buildPreviewSource(raw);
  } catch (cause) {
    if (requestId !== previewRequestId) return;
    preview.value = null;
    previewError.value = cause instanceof Error ? cause.message : 'The document could not be parsed.';
    return;
  }

  try {
    const compiled = await compileDoc(source);
    if (requestId !== previewRequestId) return;
    preview.value = compiled;
    previewError.value = null;
  } catch (cause) {
    if (requestId !== previewRequestId) return;
    preview.value = null;
    previewError.value = cause instanceof Error ? cause.message : 'The document could not be compiled.';
  }
}

function schedulePreview(): void {
  cancelPendingPreview();
  previewTimer = setTimeout(() => {
    previewTimer = undefined;
    void refreshPreview();
  }, PREVIEW_DEBOUNCE_MS);
}

function reset(): void {
  cancelPendingPreview();
  previewRequestId += 1;
  content.value = sourceDoc.value?.rawContent ?? createStarterDocument();
  preview.value = null;
  previewError.value = null;
  saveError.value = null;
  isDeleteArmed.value = false;
  activeTab.value = 'write';
  void refreshPreview();
}

watch(
  () => props.isOpen,
  (isOpen) => {
    if (isOpen) {
      reset();
    } else {
      cancelPendingPreview();
    }
  }
);

watch(content, schedulePreview);

onUnmounted(cancelPendingPreview);

function onTabKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    activeTab.value = event.key === 'ArrowRight' ? 'preview' : 'write';
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    activeTab.value = event.key === 'Home' ? 'write' : 'preview';
  }
}

function selectTab(tab: EditorTab): void {
  activeTab.value = tab;
}

async function onSave(): Promise<void> {
  if (!canSave.value) return;

  isSaving.value = true;
  saveError.value = null;

  const result = saveDoc(content.value, props.docId ?? undefined);

  isSaving.value = false;

  if (!result.success) {
    saveError.value = result.error;
    return;
  }

  emit('saved', result.doc);
  emit('close');
}

function onDelete(): void {
  const deletedId = props.docId;
  if (deletedId === null) return;

  if (!isDeleteArmed.value) {
    isDeleteArmed.value = true;
    return;
  }

  // `deleteDoc` mutates the corpus synchronously, so by the time the shell
  // receives this event the document is already gone and can no longer be
  // resolved from the reactive corpus. The id is captured and emitted for that
  // reason: the shell needs the identity of what went away, not a live lookup.
  if (deleteDoc(deletedId)) {
    emit('deleted', deletedId);
    emit('close');
    return;
  }

  saveError.value = 'The document could not be deleted. Storage may be unavailable.';
  isDeleteArmed.value = false;
}
</script>

<template>
  <BaseModal
    :is-open="isOpen"
    aria-label="Edit documentation"
    labelled-by="editor-modal-title"
    @close="emit('close')"
  >
    <div class="flex min-h-0 flex-1 flex-col" data-testid="editor-modal">
      <div class="border-b border-slate-200 px-4 py-4 pr-16 dark:border-slate-800">
        <h2
          id="editor-modal-title"
          class="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {{ dialogTitle }}
        </h2>
        <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          YAML frontmatter first, then markdown. The preview is exactly what readers will see.
        </p>

        <!--
          Storage is browser-local and has no server-side copy. A reader who
          clears site data loses unpublished work permanently, so that
          consequence is stated in the composer rather than discovered later.
        -->
        <p
          class="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          data-testid="storage-disclaimer"
        >
          <svg
            aria-hidden="true"
            class="mt-0.5 size-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <span>
            <strong class="font-semibold">Local storage active.</strong> Documents are stored
            exclusively in this browser profile. Clearing browser data permanently removes
            unsaved modifications.
          </span>
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Editor view"
        class="flex shrink-0 gap-1 border-b border-slate-200 px-2 dark:border-slate-800 md:hidden"
        @keydown="onTabKeydown"
      >
        <button
          v-for="tab in EDITOR_TABS"
          :id="`editor-tab-${tab}`"
          :key="tab"
          type="button"
          role="tab"
          :tabindex="activeTab === tab ? 0 : -1"
          :aria-selected="activeTab === tab"
          :aria-controls="`editor-panel-${tab}`"
          :data-testid="`editor-tab-${tab}`"
          class="min-h-11 flex-1 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          :class="
            activeTab === tab
              ? 'border-brand-500 text-brand-600 dark:text-brand-500'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'
          "
          @click="selectTab(tab)"
        >
          <span class="inline-flex items-center gap-1.5">
            {{ tab === 'write' ? 'Write' : 'Preview' }}
            <span
              v-if="tab === 'preview' && previewError"
              class="size-1.5 rounded-full bg-rose-500"
              data-testid="preview-error-dot"
            />
            <span v-if="tab === 'preview' && previewError" class="sr-only">
              (the preview has an error)
            </span>
          </span>
        </button>
      </div>

      <div class="grid min-h-0 flex-1 md:grid-cols-2">
        <section
          id="editor-panel-write"
          role="tabpanel"
          aria-labelledby="editor-tab-write"
          class="min-h-0 flex-col p-4 md:flex"
          :class="activeTab === 'write' ? 'flex' : 'hidden md:flex'"
        >
          <BaseTextarea
            v-model="content"
            id="editor-source"
            label="Document source"
            :rows="16"
            monospace
            :resizable="false"
            class="min-h-0 flex-1"
            data-testid="editor-source"
          />
        </section>

        <section
          id="editor-panel-preview"
          role="tabpanel"
          aria-labelledby="editor-tab-preview"
          class="min-h-0 flex-col overflow-y-auto border-t border-slate-200 p-4 md:flex md:border-t-0 md:border-l dark:border-slate-800"
          :class="activeTab === 'preview' ? 'flex' : 'hidden md:flex'"
        >
          <div
            v-if="previewError"
            class="rounded-lg border border-rose-300 bg-rose-50 p-4 dark:border-rose-500/40 dark:bg-rose-500/10"
            role="alert"
            data-testid="preview-error"
          >
            <p class="text-sm font-semibold text-rose-700 dark:text-rose-300">
              The preview cannot render yet
            </p>
            <p class="mt-1 font-mono text-xs break-words text-rose-600 dark:text-rose-400">
              {{ previewError }}
            </p>
          </div>

          <template v-else-if="preview">
            <div
              class="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
            >
              <BaseBadge tone="brand" size="sm">{{ preview.category }}</BaseBadge>
              <span>{{ preview.readingTimeMinutes }} min read</span>
              <span aria-hidden="true">•</span>
              <span>{{ preview.headings.length }} sections</span>
            </div>
            <h1 class="mb-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
              {{ preview.title }}
            </h1>
            <div
              class="prose prose-slate max-w-none dark:prose-invert"
              data-testid="preview-content"
              v-html="preview.htmlContent"
            />
          </template>

          <p v-else class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Nothing to preview yet.
          </p>
        </section>
      </div>

      <div
        class="flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800"
      >
        <p
          v-if="saveError"
          role="alert"
          class="min-w-0 flex-1 font-mono text-xs break-words text-rose-600 dark:text-rose-400"
          data-testid="save-error"
        >
          {{ saveError }}
        </p>
        <p v-else class="flex-1 text-xs text-slate-500 dark:text-slate-400">
          The slug must be lowercase kebab-case and unique across the corpus.
        </p>

        <div class="flex items-center gap-2">
          <BaseButton
            v-if="isEditingExisting"
            :variant="isDeleteArmed ? 'danger' : 'ghost'"
            size="sm"
            data-testid="editor-delete"
            @click="onDelete"
          >
            {{ isDeleteArmed ? 'Confirm delete' : 'Delete' }}
          </BaseButton>

          <BaseButton
            v-if="isDeleteArmed"
            variant="ghost"
            size="sm"
            @click="isDeleteArmed = false"
          >
            Cancel
          </BaseButton>

          <BaseButton
            variant="secondary"
            size="sm"
            data-testid="editor-cancel"
            @click="emit('close')"
          >
            Cancel
          </BaseButton>

          <BaseButton
            :disabled="!canSave"
            :loading="isSaving"
            size="sm"
            data-testid="editor-save"
            @click="onSave"
          >
            Save
          </BaseButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

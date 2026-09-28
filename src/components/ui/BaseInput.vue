<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * A labelled single-line text field.
 *
 * The control renders at `text-base` (16px) so that iOS Safari does not zoom
 * the viewport when the field receives focus. The error state is wired through
 * `aria-invalid` and `aria-describedby`, and the message is announced with
 * `role="alert"` so a validation failure is not silent.
 *
 * Fallthrough attributes are forwarded to the real `<input>` rather than the
 * label wrapper, so `role`, `aria-controls`, `data-*` and test hooks land on
 * the focusable element where they belong.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    /** Unique id; also wires `label` and `aria-describedby` to the control. */
    id: string;
    /** Visible label text. Always rendered, never placeholder-only. */
    label: string;
    /** Native input type. */
    type?: 'text' | 'search' | 'email' | 'url' | 'tel';
    /** Placeholder text. Never the sole description of the field. */
    placeholder?: string;
    /** Secondary help text shown below the control. */
    hint?: string;
    /** Validation message. Replaces the hint and switches the control to its error state. */
    error?: string;
    /** Marks the control as required and appends an asterisk to the label. */
    required?: boolean;
    /** Disables the control. */
    disabled?: boolean;
    /** Makes the control read-only without dimming it. */
    readonly?: boolean;
    /** Value for the native autocomplete attribute. */
    autocomplete?: string;
    /** Virtual keyboard hint for mobile browsers. */
    inputmode?: 'none' | 'text' | 'search' | 'email' | 'url' | 'tel' | 'numeric';
    /** Placeholder shown while no value is present and no placeholder is set. */
    leadingIcon?: 'none' | 'search';
  }>(),
  {
    type: 'text',
    placeholder: undefined,
    hint: undefined,
    error: undefined,
    required: false,
    disabled: false,
    readonly: false,
    autocomplete: 'off',
    inputmode: undefined,
    leadingIcon: 'none'
  }
);

const emit = defineEmits<{
  (event: 'blur', focusEvent: FocusEvent): void;
  (event: 'enter', keyboardEvent: KeyboardEvent): void;
}>();

const inputElement = ref<HTMLInputElement | null>(null);

const hasError = computed<boolean>(() => props.error !== undefined && props.error.length > 0);

const describedBy = computed<string | undefined>(() => {
  if (hasError.value) return `${props.id}-error`;
  if (props.hint !== undefined && props.hint.length > 0) return `${props.id}-hint`;
  return undefined;
});

/**
 * Moves focus to the underlying control.
 *
 * Callers that own their own focus strategy (the search palette, for example)
 * cannot reach the real `<input>` through a template ref on this component,
 * because the component's root element is the label wrapper.
 */
function focus(): void {
  inputElement.value?.focus();
}

defineExpose({ focus, element: inputElement });
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="id"
      class="text-sm font-medium text-slate-700 dark:text-slate-300"
    >
      {{ label }}
      <span v-if="required" aria-hidden="true" class="text-rose-600 dark:text-rose-400">*</span>
      <span v-if="required" class="sr-only">(required)</span>
    </label>

    <div class="relative">
      <svg
        v-if="leadingIcon === 'search'"
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
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

      <input
        ref="inputElement"
        v-bind="$attrs"
        :id="id"
        v-model="model"
        :type="type"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :readonly="readonly"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :aria-invalid="hasError ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="min-h-11 w-full rounded-lg border bg-white dark:bg-slate-900 text-base text-slate-900 dark:text-slate-100 transition-colors duration-150 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-slate-50 dark:read-only:bg-slate-800/60"
        :class="[
          leadingIcon === 'search' ? 'pl-10 pr-3' : 'px-3',
          hasError
            ? 'border-rose-500 dark:border-rose-500 focus-visible:ring-rose-500'
            : 'border-slate-300 dark:border-slate-700 focus-visible:border-brand-500'
        ]"
        @blur="emit('blur', $event)"
        @keydown.enter="emit('enter', $event)"
      />
    </div>

    <p
      v-if="hasError"
      :id="`${id}-error`"
      role="alert"
      class="flex items-start gap-1.5 text-sm text-rose-600 dark:text-rose-400"
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
      <span>{{ error }}</span>
    </p>

    <p
      v-else-if="hint"
      :id="`${id}-hint`"
      class="text-xs text-slate-500 dark:text-slate-400"
    >
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * A labelled multi-line text field.
 *
 * Shares the input primitive's accessibility contract: a real `label`, an
 * `aria-describedby` link to the hint or error, and `text-base` so mobile
 * Safari does not zoom on focus.
 *
 * Fallthrough attributes are forwarded to the real `<textarea>` rather than
 * the label wrapper, matching `BaseInput`.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ default: '' });

const props = withDefaults(
  defineProps<{
    /** Unique id; also wires `label` and `aria-describedby` to the control. */
    id: string;
    /** Visible label text. */
    label: string;
    /** Initial height, in rows. */
    rows?: number;
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
    /** Renders in the monospace face, used by the markdown editor. */
    monospace?: boolean;
    /** Allows the user to drag the control taller. */
    resizable?: boolean;
  }>(),
  {
    rows: 6,
    placeholder: undefined,
    hint: undefined,
    error: undefined,
    required: false,
    disabled: false,
    readonly: false,
    monospace: false,
    resizable: true
  }
);

const emit = defineEmits<{
  (event: 'blur', focusEvent: FocusEvent): void;
}>();

const hasError = computed<boolean>(() => props.error !== undefined && props.error.length > 0);

const describedBy = computed<string | undefined>(() => {
  if (hasError.value) return `${props.id}-error`;
  if (props.hint !== undefined && props.hint.length > 0) return `${props.id}-hint`;
  return undefined;
});
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium text-slate-700 dark:text-slate-300">
      {{ label }}
      <span v-if="required" aria-hidden="true" class="text-rose-600 dark:text-rose-400">*</span>
      <span v-if="required" class="sr-only">(required)</span>
    </label>

    <textarea
      v-bind="$attrs"
      :id="id"
      v-model="model"
      :rows="rows"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="hasError ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="w-full rounded-lg border bg-white dark:bg-slate-900 text-base text-slate-900 dark:text-slate-100 leading-relaxed transition-colors duration-150 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-slate-50 dark:read-only:bg-slate-800/60"
      :class="[
        monospace ? 'font-mono text-sm' : 'font-sans',
        resizable ? 'resize-y' : 'resize-none',
        hasError
          ? 'border-rose-500 dark:border-rose-500 focus-visible:ring-rose-500'
          : 'border-slate-300 dark:border-slate-700 focus-visible:border-brand-500'
      ]"
      @blur="emit('blur', $event)"
    />

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

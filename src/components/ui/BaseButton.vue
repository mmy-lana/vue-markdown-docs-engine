<script setup lang="ts">
import { computed } from 'vue';

/**
 * The single button primitive.
 *
 * Every variant honours the 44x44 CSS pixel minimum touch target required on
 * hand-held devices, and every interactive state exposes a visible focus ring
 * that is only drawn for keyboard users.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    /** Visual treatment. */
    variant?: ButtonVariant;
    /** Control height. `sm` still clears the 44px touch minimum. */
    size?: ButtonSize;
    /** Native button behaviour. Defaults to `button` to avoid form submits. */
    type?: 'button' | 'submit' | 'reset';
    /** Disables interaction and dims the control. */
    disabled?: boolean;
    /** Shows a spinner, blocks interaction and announces the busy state. */
    loading?: boolean;
    /** Stretches the button to the full width of its container. */
    block?: boolean;
    /** Overrides the accessible name when the button has no visible text. */
    ariaLabel?: string;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    block: false,
    ariaLabel: undefined
  }
);

const emit = defineEmits<{
  (event: 'click', mouseEvent: MouseEvent): void;
}>();

/** A loading button must never fire, even if a caller re-enables it. */
const isInert = computed<boolean>(() => props.disabled || props.loading);

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 disabled:hover:bg-brand-500',
  secondary:
    'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600',
  ghost:
    'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800'
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-11 min-w-11 px-3 text-sm gap-1.5',
  md: 'min-h-11 min-w-11 px-4 text-sm gap-2',
  lg: 'min-h-11 min-w-11 px-5 text-base gap-2'
};

function handleClick(mouseEvent: MouseEvent): void {
  if (isInert.value) {
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    return;
  }
  emit('click', mouseEvent);
}
</script>

<template>
  <button
    :type="type"
    :disabled="isInert"
    :aria-label="ariaLabel"
    :aria-busy="loading ? 'true' : undefined"
    :aria-disabled="isInert ? 'true' : undefined"
    class="inline-flex items-center justify-center rounded-lg font-medium transition-colors duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
    :class="[variantClasses[variant], sizeClasses[size], block ? 'w-full' : '']"
    @click="handleClick"
  >
    <svg
      v-if="loading"
      aria-hidden="true"
      class="size-4 shrink-0 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
    <slot />
  </button>
</template>

<script setup lang="ts">
/**
 * A compact status or metadata badge used for categories, tag chips and
 * result counts.
 */

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

withDefaults(
  defineProps<{
    /** Semantic colour treatment. */
    tone?: BadgeTone;
    /** Visual weight of the badge. */
    size?: BadgeSize;
    /** Renders a leading dot for at-a-glance status scanning. */
    dot?: boolean;
  }>(),
  { tone: 'neutral', size: 'sm', dot: false }
);

const toneClasses: Record<BadgeTone, string> = {
  neutral:
    'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700',
  brand: 'bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-100 ring-brand-500/30',
  success:
    'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
  warning:
    'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-amber-500/30',
  danger: 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30',
  info: 'bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-sky-500/30'
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: 'bg-slate-400 dark:bg-slate-500',
  brand: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500'
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-2.5 py-1 text-sm gap-1.5'
};
</script>

<template>
  <span
    class="inline-flex items-center rounded-full font-medium whitespace-nowrap ring-1 ring-inset"
    :class="[toneClasses[tone], sizeClasses[size]]"
  >
    <span
      v-if="dot"
      aria-hidden="true"
      class="size-1.5 shrink-0 rounded-full"
      :class="dotClasses[tone]"
    />
    <slot />
  </span>
</template>

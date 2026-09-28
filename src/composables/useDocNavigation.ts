import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { DocItem, NavGroup, NavLink } from '@/types';
import { useDocStorage } from '@/composables/useDocStorage';

/** The previous and next documents flanking a given slug. */
export interface PagerLinks {
  prev: NavLink | null;
  next: NavLink | null;
}

/**
 * Navigation state derived from the published corpus: category groups for the
 * sidebar, the document the current route points at, and sequential paging.
 */
export function useDocNavigation() {
  const route = useRoute();
  const { docs } = useDocStorage();

  const currentSlug = computed<string>(() => {
    const param = route.params['slug'];
    return typeof param === 'string' ? param : '';
  });

  /** The document the current route resolves to, if it is published. */
  const activeDoc = computed<DocItem | null>(
    () => docs.value.find((doc) => doc.slug === currentSlug.value && !doc.isDraft) ?? null
  );

  /**
   * Published documents grouped by category.
   *
   * Group order follows the lowest `order` value it contains, and documents
   * within a group follow their own `order`. Ties break alphabetically so the
   * sidebar is stable across reloads.
   */
  const groups = computed<NavGroup[]>(() => {
    const categoryMap = new Map<string, NavLink[]>();

    for (const doc of docs.value) {
      if (doc.isDraft) continue;
      const items = categoryMap.get(doc.category) ?? [];
      items.push({ id: doc.id, title: doc.title, slug: doc.slug, order: doc.order });
      categoryMap.set(doc.category, items);
    }

    const result: NavGroup[] = [];
    let groupIndex = 0;

    for (const [name, items] of categoryMap) {
      items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
      result.push({
        id: `group-${groupIndex++}`,
        name,
        order: items[0]?.order ?? 100,
        items
      });
    }

    return result.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  });

  /** The reading sequence: every published document, in sidebar order. */
  const flatLinks = computed<NavLink[]>(() =>
    groups.value.flatMap((group) => group.items)
  );

  /**
   * Resolves the documents on either side of `targetSlug` in reading order.
   * An unknown slug yields an empty pager rather than guessing neighbours.
   */
  function getPager(targetSlug: string): PagerLinks {
    const links = flatLinks.value;
    const currentIndex = links.findIndex((item) => item.slug === targetSlug);
    if (currentIndex === -1) return { prev: null, next: null };

    return {
      prev: currentIndex > 0 ? (links[currentIndex - 1] ?? null) : null,
      next: currentIndex < links.length - 1 ? (links[currentIndex + 1] ?? null) : null
    };
  }

  const pager = computed<PagerLinks>(() => getPager(currentSlug.value));

  return {
    groups,
    activeDoc,
    currentSlug,
    pager,
    getPager
  };
}

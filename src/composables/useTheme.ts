import { readonly, ref } from 'vue';

/**
 * The light and dark theme preference.
 *
 * A blocking script in `index.html` applies the stored preference before the
 * first paint, so this composable only has to keep the document element in
 * sync afterwards. It reads that same pre-paint state on creation rather than
 * guessing, which is what keeps the two halves from disagreeing.
 */

/** Must stay in sync with the key read by the pre-paint script in index.html. */
const THEME_STORAGE_KEY = 'vue_docs_theme';

export type ThemePreference = 'light' | 'dark';

const isDark = ref<boolean>(false);

/** `true` when Web Storage is usable; a blocked store still supports toggling. */
let storageAvailable = true;

function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference(): ThemePreference | null {
  if (!storageAvailable) return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    storageAvailable = false;
    return null;
  }
}

function persist(preference: ThemePreference): void {
  if (!storageAvailable) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    storageAvailable = false;
  }
}

function applyToDocument(dark: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', dark);
  // Keeps native form controls, scrollbars and the canvas background in step.
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

/**
 * Seeds reactive state from what the pre-paint script already decided, so the
 * first render matches the DOM rather than flashing back to light.
 */
if (typeof document !== 'undefined') {
  isDark.value = document.documentElement.classList.contains('dark');
} else {
  isDark.value = readStoredPreference() === 'dark' || prefersDark();
}

applyToDocument(isDark.value);

/**
 * Reads and writes the theme preference.
 *
 * The preference is explicit once the visitor chooses one; until then it
 * follows the operating system, and a later system change is honoured.
 */
export function useTheme() {
  function setTheme(preference: ThemePreference): void {
    isDark.value = preference === 'dark';
    applyToDocument(isDark.value);
    persist(preference);
  }

  function toggleTheme(): void {
    setTheme(isDark.value ? 'light' : 'dark');
  }

  /**
   * Follows the operating system until the visitor makes an explicit choice.
   * Returns a disposer for callers that mount and unmount repeatedly.
   */
  function watchSystemPreference(): () => void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {};
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => {
      if (readStoredPreference() !== null) return;
      isDark.value = event.matches;
      applyToDocument(isDark.value);
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }

  return {
    isDark: readonly(isDark),
    setTheme,
    toggleTheme,
    watchSystemPreference
  };
}

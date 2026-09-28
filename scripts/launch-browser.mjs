/**
 * Browser launcher shared by every Playwright suite in this repository.
 *
 * Headless CI containers have the bundled Playwright Chromium but usually no
 * Google Chrome, so the bundled browser is attempted first and the system
 * channel is only a fallback. That ordering keeps the suites runnable on a
 * clean machine with nothing installed beyond `playwright`.
 *
 * Install the bundled browser once with:
 *   pnpm exec playwright install chromium
 */
import { chromium } from 'playwright';

/**
 * @returns {Promise<import('playwright').Browser>} a headless browser instance.
 * @throws {Error} when neither the bundled browser nor a system Chrome exists.
 */
export async function launchHeadlessBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (bundledError) {
    try {
      return await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      const detail =
        bundledError instanceof Error ? bundledError.message : String(bundledError);
      throw new Error(
        [
          'Unable to launch a browser for verification.',
          'Install the bundled Chromium with: pnpm exec playwright install chromium',
          `Underlying error: ${detail.split('\n')[0] ?? detail}`
        ].join('\n')
      );
    }
  }
}

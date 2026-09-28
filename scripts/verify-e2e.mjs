/**
 * End-to-end verification of the assembled application.
 *
 * Serves the production build and drives it in a real Chromium across the
 * viewport matrix the specification calls for, plus the flows that are
 * easy to break while refactoring: navigation, search, the composer, theme
 * persistence, heading anchors and the code copy button.
 *
 * Requires a current build:  pnpm build
 * Run with:                  pnpm verify:e2e
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchHeadlessBrowser } from './launch-browser.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html is missing. Run `pnpm build` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.json': 'application/json'
};

/** Static server with single-page-application fallback. */
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const relative = normalize(path).replace(/^(\.\.[/\\])+/, '').replace(/^\/+/, '');
  const candidate = join(DIST, relative);

  if (relative.length > 0 && existsSync(candidate) && !candidate.endsWith('/')) {
    res.writeHead(200, { 'content-type': MIME[extname(candidate)] ?? 'application/octet-stream' });
    res.end(readFileSync(candidate));
    return;
  }

  res.writeHead(200, { 'content-type': MIME['.html'] });
  res.end(readFileSync(join(DIST, 'index.html')));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
let checks = 0;
let currentSection = '';

function section(title) {
  currentSection = title;
  console.log(`\n${title}`);
}

function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    const message = `${currentSection} :: ${label}${detail ? ` — ${detail}` : ''}`;
    failures.push(message);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await launchHeadlessBrowser();

/** A fresh context per scenario, so localStorage never leaks between them. */
async function openApp(width, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`${base}/docs/getting-started`);
  await page.waitForSelector('[data-testid="doc-content"]', { timeout: 20000 });
  return { context, page, pageErrors };
}

const HEADER_HEIGHT = 64;

/**
 * Asserts the navigation rail starts below the sticky header.
 *
 * Regression guard for the desktop sidebar/header collision.
 *
 * The selector is scoped to the rail on purpose. `[data-testid^="nav-"]` on its
 * own also matches the header's `nav-toggle` button, which is display:none from
 * `lg` up, so an unscoped first match resolves to a hidden element and the
 * bounding box comes back null.
 *
 * Within the rail, entries are checked in document order rather than by name.
 * Category groups sort alphabetically, so the topmost link belongs to whichever
 * group sorts first and moves whenever a category is renamed. Asserting a
 * fixed slug checks a link several rows down and would pass while the real top
 * of the rail was occluded.
 */
async function assertSidebarClearsHeader(page, label) {
  const headerBox = await page.locator('header').first().boundingBox();
  const railBox = await page.locator('[data-testid="sidebar-rail"]').boundingBox();
  const railItems = page.locator('[data-testid="sidebar-rail"] [data-testid^="nav-"]');
  const firstItem = railItems.first();
  const firstEntryBox = await firstItem.boundingBox();

  check(`${label}: the header is the expected 64px tall`,
    headerBox !== null && Math.abs(headerBox.height - HEADER_HEIGHT) < 1,
    JSON.stringify(headerBox));
  check(`${label}: the navigation rail starts below the header`,
    railBox !== null && railBox.y >= HEADER_HEIGHT - 1, JSON.stringify(railBox));
  check(`${label}: the first navigation entry is at or below 64px`,
    firstEntryBox !== null && firstEntryBox.y >= HEADER_HEIGHT,
    JSON.stringify(firstEntryBox));

  check(`${label}: the rail does not overlap the header`,
    railBox !== null && headerBox !== null && railBox.y >= headerBox.height - 1,
    JSON.stringify({ rail: railBox, header: headerBox }));

  const entries = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="sidebar-rail"] [data-testid^="nav-"]')]
      .map((el) => ({
        id: el.getAttribute('data-testid'),
        y: el.getBoundingClientRect().top,
        rendered: el.getClientRects().length > 0
      }))
      .filter((entry) => entry.rendered)
  );

  check(`${label}: the rail renders at least one navigation entry`, entries.length > 0, String(entries.length));

  const topmost = entries[0];
  check(`${label}: the asserted entry really is the topmost one`,
    topmost !== undefined && firstEntryBox !== null &&
      Math.round(firstEntryBox.y) === Math.round(topmost.y),
    JSON.stringify({ asserted: firstEntryBox, topmost }));

  check(`${label}: the topmost navigation entry starts at or below 64px`,
    topmost !== undefined && topmost.y >= HEADER_HEIGHT, JSON.stringify(topmost));

  const intruders = entries.filter((entry) => entry.y < HEADER_HEIGHT);
  check(`${label}: no navigation entry renders inside the header band`,
    intruders.length === 0,
    JSON.stringify(intruders.map((e) => `${e.id}@${Math.round(e.y)}`)));

  // Independent of layout maths: the header must own the pixels a reader would
  // click in that band, rather than rail content bleeding through it.
  const topOfBand = await page.evaluate(() => {
    const header = document.querySelector('header');
    const element = document.elementFromPoint(header.getBoundingClientRect().width / 2, 20);
    return element === null ? 'null' : (element.closest('header') !== null ? 'header' : 'other');
  });
  check(`${label}: the header owns the 20px band`,
    topOfBand === 'header', topOfBand);
}

/**
 * Waits for the drawer to finish sliding.
 *
 * The rail carries a 200ms transform transition, so a fixed sleep after the
 * click races the animation: the class flips immediately while the box is
 * still on screen. Waiting on the settled position removes the flake.
 */
async function waitForDrawer(page, open) {
  await page.waitForFunction(
    (wantOpen) => {
      const rail = document.querySelector('[data-testid="sidebar-rail"]');
      if (rail === null) return false;
      const box = rail.getBoundingClientRect();
      // "Open" is the rail on screen. "Closed" is the rail fully off screen,
      // not merely moved: a sliding rail passes x < 0 immediately, so any
      // weaker test returns while the 200ms transition is still running.
      const onScreen = box.x >= -1;
      const fullyOffScreen = box.x + box.width <= 1;
      return wantOpen ? onScreen : fullyOffScreen;
    },
    open,
    { timeout: 5000 }
  );
}

const noHorizontalScroll = (page) =>
  page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );

// ---------------------------------------------------------------- 360px
{
  section('[360px] header fits and the search button collapses');
  const { context, page, pageErrors } = await openApp(360, 780);

  check('page does not scroll horizontally', await noHorizontalScroll(page),
    await page.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`));
  const overflowers = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.right <= width + 1) return false;
        // Content inside a scroll container is meant to extend past the edge.
        let parent = el.parentElement;
        while (parent) {
          const style = getComputedStyle(parent);
          if (/(auto|scroll)/.test(style.overflowX)) return false;
          parent = parent.parentElement;
        }
        return true;
      })
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 40)} right=${Math.round(el.getBoundingClientRect().right)}`);
  });
  check('no element escapes the viewport outside a scroll container',
    overflowers.length === 0, JSON.stringify(overflowers.slice(0, 4)));

  const searchLabel = page.getByText('Search docs...');
  check('the search button label is hidden at 360px', !(await searchLabel.isVisible()));
  const searchBox = await page.locator('[data-testid="search-toggle"]').boundingBox();
  check('the search button still meets the 44px touch target',
    searchBox.height >= 44 && searchBox.width >= 44, JSON.stringify(searchBox));
  check('the navigation toggle is present at 360px', await page.locator('[data-testid="nav-toggle"]').isVisible());
  check('the document title is rendered', (await page.locator('[data-testid="doc-title"]').textContent())?.trim() === 'Getting Started');
  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// ---------------------------------------------------------------- 390px
{
  section('[390px] every touch target clears 44px');
  const { context, page, pageErrors } = await openApp(390, 844);

  // The drawer is the primary navigation at this width, so it is opened
  // explicitly rather than relied upon to be open on arrival.
  await page.locator('[data-testid="nav-toggle"]').click();
  await waitForDrawer(page, true);

  // Escape must dismiss the drawer, release the scroll lock and hand focus
  // back to the control that opened it. It is exercised before the target
  // sweep because the open drawer covers that control.
  const drawerIsOnScreen = () =>
    page.evaluate(() => {
      const rail = document.querySelector('[data-testid="sidebar-rail"]');
      return rail !== null && rail.getBoundingClientRect().x >= -1;
    });

  check('the drawer is open on arrival at 390px', await drawerIsOnScreen());
  check('focus entered the drawer when it opened', await page.evaluate(() => {
    const rail = document.querySelector('[data-testid="sidebar-rail"]');
    return rail !== null && document.activeElement !== null && rail.contains(document.activeElement);
  }));

  await page.keyboard.press('Escape');
  await waitForDrawer(page, false);
  check('Escape dismisses the drawer', (await drawerIsOnScreen()) === false);
  check('Escape releases the body scroll lock',
    (await page.evaluate(() => document.body.style.overflow)) === '');
  check('focus returns to the navigation toggle after Escape',
    (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'nav-toggle',
    await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName ?? 'none'));

  // Re-open for the touch-target sweep across the drawer's controls.
  await page.locator('[data-testid="nav-toggle"]').click();
  await waitForDrawer(page, true);

  const tooSmall = await page.evaluate(() => {
    // `pre` carries Shiki's tabindex so it can be scrolled by keyboard; it is
    // a scroll region, not a tap target, so it is excluded from this check.
    const selector = 'button, a[href], input, textarea, select, [role="tab"]:not(pre)';
    const focusables = '[tabindex]:not([tabindex="-1"])';
    const targets = new Set([...document.querySelectorAll(selector), ...document.querySelectorAll(focusables)]);
    return [...targets]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => !el.closest('pre, code'))
      // WCAG 2.2 Target Size (Minimum) exempts targets that sit inside a
      // sentence or block of running text. The links inside a rendered
      // paragraph fall under that exception; padding every inline link to
      // 44px would break the prose measure.
      .filter((el) => !(el.tagName === 'A' && el.closest('p') !== null))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          cls: String(el.className).slice(0, 34),
          text: (el.textContent ?? '').trim().slice(0, 24),
          w: Math.round(rect.width),
          h: Math.round(rect.height)
        };
      })
      .filter((r) => r.w < 44 || r.h < 44);
  });
  check('no visible interactive element is smaller than 44x44',
    tooSmall.length === 0, JSON.stringify(tooSmall.slice(0, 5)));

  const tocTargets = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="toc-accordion-toggle"]');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  });
  check('the table of contents toggle clears 44px',
    tocTargets !== null && tocTargets.h >= 44, JSON.stringify(tocTargets));
  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// ---------------------------------------------------------------- 430px
{
  section('[430px] code blocks scroll without widening the page');
  const { context, page, pageErrors } = await openApp(430, 932);

  await page.goto(`${base}/docs/markdown-rendering`);
  await page.waitForSelector('.doc-code-card');

  check('page does not scroll horizontally', await noHorizontalScroll(page),
    await page.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`));
  check('a code card is present', (await page.locator('.doc-code-card').count()) > 0);

  const overflow = await page.evaluate(() => {
    const scroller = document.querySelector('.doc-code-card .overflow-x-auto');
    if (!scroller) return null;
    return { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth };
  });
  check('the code scroller is the element that overflows, not the page',
    overflow !== null && overflow.scrollWidth > overflow.clientWidth && (await noHorizontalScroll(page)),
    JSON.stringify(overflow));
  check('the table of contents accordion is shown below xl',
    await page.locator('[data-testid="toc-accordion-toggle"]').isVisible());
  check('the sticky right rail is hidden below xl',
    !(await page.locator('[data-testid="toc-rail"]').isVisible()));
  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// ---------------------------------------------------------------- 768px
{
  section('[768px] drawer navigation and the search palette');
  const { context, page, pageErrors } = await openApp(768, 1024);

  check('the drawer toggle is visible at 768px', await page.locator('[data-testid="nav-toggle"]').isVisible());
  check('the rail is parked off screen at 768px',
    (await page.locator('[data-testid="sidebar-rail"]').boundingBox())?.x < 0,
    JSON.stringify(await page.locator('[data-testid="sidebar-rail"]').boundingBox()));

  const rail = page.locator('[data-testid="sidebar-rail"]');
  check('the rail exists even when the drawer is closed', (await rail.count()) === 1);

  await page.locator('[data-testid="nav-toggle"]').click();
  await waitForDrawer(page, true);
  check('the drawer slides in', await rail.isVisible());
  const openDrawerBox = await rail.boundingBox();
  check('the drawer is on screen when open',
    openDrawerBox !== null && openDrawerBox.x >= -1, JSON.stringify(openDrawerBox));
  check('opening the drawer locks background scroll',
    (await page.evaluate(() => document.body.style.overflow)) === 'hidden');
  check('the active document is marked in the drawer',
    (await page.getAttribute('[data-testid="nav-getting-started"]', 'aria-current')) === 'page');

  // Keyboard lifecycle. The drawer is a modal overlay, so it behaves like one:
  // it takes focus, keeps it, and hands it back on the way out.
  const focusIsInDrawer = () =>
    page.evaluate(() => {
      const railEl = document.querySelector('[data-testid="sidebar-rail"]');
      return railEl !== null && document.activeElement !== null && railEl.contains(document.activeElement);
    });

  check('opening the drawer moves focus into it', await focusIsInDrawer());

  const tabStaysInside = [];
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    tabStaysInside.push(await focusIsInDrawer());
  }
  check('Tab never escapes the drawer', tabStaysInside.every(Boolean),
    JSON.stringify(tabStaysInside));

  const scrimBg = await page.evaluate(() => {
    const scrim = document.querySelector('[data-testid="nav-scrim"]');
    return scrim === null ? null : getComputedStyle(scrim).backgroundColor;
  });
  check('the drawer scrim is painted', scrimBg !== null && scrimBg !== 'rgba(0, 0, 0, 0)',
    String(scrimBg));

  await page.locator('[data-testid="nav-local-storage"]').click();
  await page.waitForFunction(() => window.location.pathname === '/docs/local-storage');
  check('a drawer link navigates', page.url().endsWith('/docs/local-storage'));
  await waitForDrawer(page, false);
  const drawerBox = await rail.boundingBox();
  check('the drawer slides back off screen after navigating',
    drawerBox !== null && drawerBox.x + drawerBox.width <= 1, JSON.stringify(drawerBox));
  check('the scroll lock is released after the drawer closes',
    (await page.evaluate(() => document.body.style.overflow)) === '');

  await page.waitForSelector('[data-testid="doc-content"]');
  check('the new document rendered', (await page.locator('[data-testid="doc-title"]').textContent())?.trim() === 'Local Storage');

  // Search palette via the keyboard shortcut.
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('[role="dialog"]');
  check('Cmd+K opens the search palette', await page.locator('[role="dialog"]').isVisible());
  check('focus lands in the search field',
    (await page.evaluate(() => document.activeElement?.id)) === 'search-modal-input');

  await page.keyboard.type('frontmatter');
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  const resultCount = await page.locator('[role="option"]').count();
  check('typing produces search results', resultCount > 0, `${resultCount} results`);
  check('the active result is marked selected',
    (await page.getAttribute('[role="option"]', 'aria-selected')) === 'true');

  await page.keyboard.press('ArrowDown');
  const afterArrow = await page.evaluate(() => document.querySelectorAll('[aria-selected="true"]').length);
  check('arrow keys move the virtual cursor', afterArrow === 1);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  check('Enter navigates to the selected result', !page.url().endsWith('/docs/local-storage'));

  // The empty state.
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('[data-testid="search-input"]');
  await page.fill('#search-modal-input', 'zzzzznotathing');
  await page.waitForSelector('text=No results for', { timeout: 5000 });
  check('a query with no matches shows an empty state', true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  check('Escape closes the palette', true);

  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// --------------------------------------------------------------- 1024px
{
  section('[1024px] the fixed rail renders and the right column stays hidden');
  const { context, page, pageErrors } = await openApp(1024, 900);

  check('the left rail is visible at 1024px', await page.locator('[data-testid="sidebar-rail"]').isVisible());
  check('the drawer toggle is hidden at 1024px', !(await page.locator('[data-testid="nav-toggle"]').isVisible()));
  check('the right table of contents rail is hidden at 1024px',
    !(await page.locator('[data-testid="toc-rail"]').isVisible()));
  check('the mobile accordion is used at 1024px',
    await page.locator('[data-testid="toc-accordion-toggle"]').isVisible());

  const geometry = await page.evaluate(() => {
    const main = document.getElementById('main-content');
    const rail = document.querySelector('[data-testid="sidebar-rail"]');
    return { mainLeft: main.getBoundingClientRect().left, railRight: rail.getBoundingClientRect().right };
  });
  check('the main column clears the rail', Math.abs(geometry.mainLeft - geometry.railRight) < 2,
    JSON.stringify(geometry));
  check('page does not scroll horizontally', await noHorizontalScroll(page));
  await assertSidebarClearsHeader(page, '1024px');
  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// ------------------------------------------------------------ 1280px and up
{
  section('[1280px+] the three column layout');
  const { context, page, pageErrors } = await openApp(1440, 900);

  check('the left rail is visible', await page.locator('[data-testid="sidebar-rail"]').isVisible());
  check('the right table of contents rail is visible', await page.locator('[data-testid="toc-rail"]').isVisible());
  check('the mobile accordion is hidden',
    !(await page.locator('[data-testid="toc-accordion-toggle"]').isVisible()));

  const geometry = await page.evaluate(() => {
    const main = document.getElementById('main-content');
    const rail = document.querySelector('[data-testid="sidebar-rail"]');
    const toc = document.querySelector('[data-testid="toc-rail"]');
    return {
      mainLeft: main.getBoundingClientRect().left,
      railRight: rail.getBoundingClientRect().right,
      mainRight: main.getBoundingClientRect().right,
      tocLeft: toc.getBoundingClientRect().left
    };
  });
  check('the main column is inset past the left rail', Math.abs(geometry.mainLeft - geometry.railRight) < 2, JSON.stringify(geometry));
  check('the main column is inset before the right rail', Math.abs(geometry.tocLeft - geometry.mainRight) < 2, JSON.stringify(geometry));
  check('page does not scroll horizontally', await noHorizontalScroll(page));

  const tocLinks = await page.locator('[data-testid="toc-rail"] a').count();
  check('the table of contents is populated', tocLinks > 0, `${tocLinks} links`);

  // Anchor navigation through the table of contents.
  const firstAnchor = await page.locator('[data-testid="toc-rail"] a').first().getAttribute('href');
  await page.locator('[data-testid="toc-rail"] a').first().click();
  await page.waitForFunction(() => window.location.hash.length > 1);
  check('a table of contents link sets the hash',
    (await page.evaluate(() => window.location.hash)) === new URL(firstAnchor, base).hash,
    firstAnchor);
  await page.waitForTimeout(400);
  const headingTop = await page.evaluate(() => {
    const id = window.location.hash.slice(1);
    const el = document.getElementById(id);
    return el ? el.getBoundingClientRect().top : null;
  });
  check('the target heading is scrolled into view below the header',
    headingTop !== null && headingTop >= 0 && headingTop < 200, String(headingTop));
  await assertSidebarClearsHeader(page, '1440px');

  const tocBox = await page.locator('[data-testid="toc-rail"]').boundingBox();
  check('1440px: the table of contents rail starts below the header',
    tocBox !== null && tocBox.y >= HEADER_HEIGHT - 1, JSON.stringify(tocBox));
  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// ------------------------------------------------------------------ 1280px
{
  section('[1280px] the xl breakpoint boundary');
  const { context, page, pageErrors } = await openApp(1280, 900);

  check('the left rail is visible at exactly 1280px', await page.locator('[data-testid="sidebar-rail"]').isVisible());
  check('the right rail switches on at exactly 1280px', await page.locator('[data-testid="toc-rail"]').isVisible());
  check('page does not scroll horizontally', await noHorizontalScroll(page));
  await assertSidebarClearsHeader(page, '1280px');

  const geometry = await page.evaluate(() => {
    const main = document.getElementById('main-content');
    const rail = document.querySelector('[data-testid="sidebar-rail"]');
    const toc = document.querySelector('[data-testid="toc-rail"]');
    return {
      mainLeft: main.getBoundingClientRect().left,
      railRight: rail.getBoundingClientRect().right,
      mainRight: main.getBoundingClientRect().right,
      tocLeft: toc.getBoundingClientRect().left
    };
  });
  check('the main column is inset past the left rail', Math.abs(geometry.mainLeft - geometry.railRight) < 2, JSON.stringify(geometry));
  check('the main column is inset before the right rail', Math.abs(geometry.tocLeft - geometry.mainRight) < 2, JSON.stringify(geometry));
  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// ------------------------------------------------------- document behaviour
{
  section('[document] highlighting, copy button, links and not-found');
  const { context, page, pageErrors } = await openApp(1280, 900);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto(`${base}/docs/markdown-rendering`);
  await page.waitForSelector('.doc-code-card');

  const shikiVar = await page.evaluate(() => {
    const span = document.querySelector('.shiki span');
    return span ? getComputedStyle(span).getPropertyValue('--shiki-light').trim() : '';
  });
  check('shiki emits dual theme colour variables', shikiVar.length > 0, shikiVar);

  const lightColor = await page.evaluate(() => {
    const span = document.querySelector('.shiki span');
    return span ? getComputedStyle(span).color : '';
  });
  await page.locator('[data-testid="theme-toggle"]').click();
  await page.waitForTimeout(150);
  const darkColor = await page.evaluate(() => {
    const span = document.querySelector('.shiki span');
    return span ? getComputedStyle(span).color : '';
  });
  check('toggling the theme re-colours highlighted code without a re-render',
    darkColor !== '' && darkColor !== lightColor, `${lightColor} -> ${darkColor}`);
  check('the document element carries the dark class',
    await page.evaluate(() => document.documentElement.classList.contains('dark')));
  check('the preference is persisted',
    (await page.evaluate(() => localStorage.getItem('vue_docs_theme'))) === 'dark');

  await page.reload();
  await page.waitForSelector('.doc-code-card');
  check('the dark theme survives a reload without a flash of light',
    await page.evaluate(() => document.documentElement.classList.contains('dark')));

  await page.locator('[data-testid="theme-toggle"]').click();
  await page.waitForTimeout(100);

  // Copy button.
  await page.locator('.doc-code-copy-btn').first().click();
  await page.waitForTimeout(200);
  const label = (await page.locator('.doc-code-copy-btn').first().textContent())?.trim();
  check('the copy button confirms success', label === 'Copied', String(label));
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  const cardText = await page.evaluate(() =>
    document.querySelector('.doc-code-card pre').textContent.trim()
  );
  check('the clipboard holds decoded code, not the encoded payload',
    clipboard.trim() === cardText && !clipboard.includes('%20'),
    JSON.stringify({ clipboard: clipboard.slice(0, 40), card: cardText.slice(0, 40) }));

  // Links inside a document.
  const external = await page.evaluate(() => {
    const link = document.querySelector('[data-testid="doc-content"] a[href^="http"]');
    if (!link) return null;
    link.click();
    return { target: link.getAttribute('target'), rel: link.getAttribute('rel') };
  });
  check('an external link opens safely in a new tab',
    external !== null && external.target === '_blank' && (external.rel ?? '').includes('noopener'),
    JSON.stringify(external));

  // An internal document link routes without a full page load.
  const before = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  await page.goto(`${base}/docs/getting-started`);
  await page.waitForSelector('[data-testid="doc-content"] a[href^="/docs/"]');
  const internalHref = await page.locator('[data-testid="doc-content"] a[href^="/docs/"]').first().getAttribute('href');
  await page.locator('[data-testid="doc-content"] a[href^="/docs/"]').first().click();
  await page.waitForFunction((href) => window.location.pathname === new URL(href, location.origin).pathname, internalHref);
  check('an internal document link routes through the router', page.url().endsWith(internalHref), internalHref);
  check('the router handled it without a full page load',
    (await page.evaluate(() => performance.getEntriesByType('navigation').length)) === before);

  // Unknown slug.
  await page.goto(`${base}/docs/this-document-does-not-exist`);
  await page.waitForSelector('[data-testid="doc-not-found"]', { timeout: 10000 });
  check('an unknown slug renders the not-found state', true);
  check('the not-found state offers a way back',
    await page.locator('[data-testid="doc-not-found"] a').first().isVisible());

  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// ------------------------------------------------------------- the composer
{
  section('[composer] editing, validation, saving and deleting');
  const { context, page, pageErrors } = await openApp(1280, 900);

  await page.locator('[data-testid="editor-toggle"]').click();
  await page.waitForSelector('[data-testid="editor-modal"]');
  check('the composer opens', await page.locator('[data-testid="editor-modal"]').isVisible());
  check('the split view shows editor and preview together at 1280px',
    (await page.locator('#editor-panel-write').isVisible()) && (await page.locator('#editor-panel-preview').isVisible()));
  check('the preview renders a valid starter document',
    (await page.locator('[data-testid="preview-content"]').count()) === 1);

  // An invalid slug must be rejected with a readable message.
  await page.fill('#editor-source', '---\ntitle: Broken\ncategory: C\nslug: Not Kebab\n---\n# Hi\n');
  await page.waitForSelector('[data-testid="preview-error"]', { timeout: 5000 });
  check('an invalid slug is reported in the preview',
    (await page.locator('[data-testid="preview-error"]').textContent())?.includes('kebab-case') === true);

  await page.locator('[data-testid="editor-save"]').click();
  await page.waitForSelector('[data-testid="save-error"]');
  check('saving an invalid document fails with a message',
    (await page.locator('[data-testid="save-error"]').textContent())?.includes('kebab-case') === true);
  check('the composer stays open after a failed save',
    await page.locator('[data-testid="editor-modal"]').isVisible());

  // A valid new document saves and publishes.
  const unique = `verify-doc-${Date.now()}`;
  await page.fill(
    '#editor-source',
    `---\ntitle: Verification Page\ndescription: Created by the end-to-end suite.\ncategory: Operations\norder: 55\nslug: ${unique}\ntags: [verify]\nlastModified: 2026-05-01\n---\n\n## First Section\n\nBody text for the first section.\n\n## First Section\n\nA second section with the same name.\n`
  );
  await page.waitForSelector('[data-testid="preview-content"]', { timeout: 5000 });
  await page.locator('[data-testid="editor-save"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="editor-modal"]'));
  check('a valid document saves and the composer closes', true);

  const persisted = await page.evaluate((slug) => {
    const payload = JSON.parse(localStorage.getItem('vue_docs_engine_v1') ?? '{}');
    return (payload.docs ?? []).some((d) => d.slug === slug);
  }, unique);
  check('the new document reached localStorage', persisted);
  const savedDocId = await page.evaluate((slug) => {
    const payload = JSON.parse(localStorage.getItem('vue_docs_engine_v1') ?? '{}');
    return (payload.docs ?? []).find((d) => d.slug === slug)?.id ?? null;
  }, unique);
  check('the new document has a stable id', typeof savedDocId === 'string' && savedDocId.length > 0, String(savedDocId));
  check('the reader is routed to the new document', page.url().endsWith(`/docs/${unique}`), page.url());
  check('the new document rendered',
    (await page.locator('[data-testid="doc-title"]').textContent())?.trim() === 'Verification Page');

  const anchorIds = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="doc-content"] h2, [data-testid="doc-content"] h3')]
      .map((h) => h.id)
      .filter(Boolean)
  );
  check('duplicate headings received unique anchors in the published document',
    JSON.stringify(anchorIds) === JSON.stringify(['h-first-section', 'h-first-section-2']),
    JSON.stringify(anchorIds));

  // It survives a reload, because storage is the source of truth.
  await page.reload();
  await page.waitForSelector('[data-testid="doc-title"]');
  check('the new document survives a reload',
    (await page.locator('[data-testid="doc-title"]').textContent())?.trim() === 'Verification Page');

  // Deleting it requires confirmation and then leaves a tombstone.
  await page.locator('[data-testid="editor-toggle"]').click();
  await page.waitForSelector('[data-testid="editor-delete"]');
  await page.locator('[data-testid="editor-delete"]').click();
  check('the first delete press asks for confirmation',
    (await page.locator('[data-testid="editor-delete"]').textContent())?.includes('Confirm') === true);
  await page.locator('[data-testid="editor-delete"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="editor-modal"]'));
  const afterDelete = await page.evaluate(({ slug, id }) => {
    const payload = JSON.parse(localStorage.getItem('vue_docs_engine_v1') ?? '{}');
    return {
      present: (payload.docs ?? []).some((d) => d.slug === slug),
      hasTombstone: typeof payload.deletedAtMap?.[id] === 'number'
    };
  }, { slug: unique, id: savedDocId });
  check('the document is gone from storage', !afterDelete.present);
  check('a deletion tombstone was recorded', afterDelete.hasTombstone, JSON.stringify(afterDelete));

  await page.goto(`${base}/docs/${unique}`);
  await page.waitForSelector('[data-testid="doc-not-found"]', { timeout: 10000 });
  check('the deleted document is not resurrected by reconciliation', true);

  // Tabbed layout below md.
  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(`${base}/docs/getting-started`);
  await narrowPage.waitForSelector('[data-testid="editor-toggle"]');
  await narrowPage.locator('[data-testid="editor-toggle"]').click();
  await narrowPage.waitForSelector('[data-testid="editor-tab-write"]');
  check('the composer is tabbed below md',
    await narrowPage.locator('[data-testid="editor-tab-write"]').isVisible());
  check('only the write panel is shown by default on mobile',
    (await narrowPage.locator('#editor-panel-preview').isVisible()) === false);
  await narrowPage.locator('[data-testid="editor-tab-preview"]').click();
  await narrowPage.waitForTimeout(150);
  check('switching to the preview tab reveals the preview',
    await narrowPage.locator('#editor-panel-preview').isVisible());
  check('the write panel is hidden while the preview tab is active',
    (await narrowPage.locator('#editor-panel-write').isVisible()) === false);
  await narrow.close();

  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}


// --------------------------------------------------------------- security
{
  section('[security] storage quotas, link protocols and source hygiene');

  // 1. Storage quota: an oversized document must be refused before it can
  //    consume the origin quota, and must leave storage untouched.
  const { context, page, pageErrors } = await openApp(1280, 900);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const before = await page.evaluate(() => (localStorage.getItem('vue_docs_engine_v1') ?? '').length);
  await page.locator('[data-testid="editor-toggle"]').click();
  await page.waitForSelector('[data-testid="editor-modal"]');

  // Pushed through the DOM directly: a 520 KB string through a typed
  // keystroke simulation would take minutes for no added coverage.
  await page.evaluate((size) => {
    const field = document.getElementById('editor-source');
    const value =
      '---\ntitle: Oversized\ncategory: Operations\nslug: oversized-doc\n---\n\n' + 'x'.repeat(size);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, 520_000);

  await page.waitForSelector('[data-testid="preview-error"]', { timeout: 20_000 });
  await page.locator('[data-testid="editor-save"]').click();
  await page.waitForSelector('[data-testid="save-error"]', { timeout: 15_000 });

  const quotaError = (await page.locator('[data-testid="save-error"]').textContent())?.trim();
  check('an oversized document is rejected with the documented message',
    quotaError === 'Document exceeds the maximum permitted size of 500 KB.', String(quotaError));
  check('the composer stays open after a quota rejection',
    await page.locator('[data-testid="editor-modal"]').isVisible());
  check('the oversized preview reports rather than rendering',
    (await page.locator('[data-testid="preview-error"]').textContent())?.includes('Preview is disabled') === true);
  check('nothing oversized reached storage',
    (await page.evaluate(() => (localStorage.getItem('vue_docs_engine_v1') ?? '').length)) === before);
  check('the oversized document is not in the corpus',
    await page.evaluate(() =>
      (JSON.parse(localStorage.getItem('vue_docs_engine_v1') ?? '{}').docs ?? [])
        .some((d) => d.slug === 'oversized-doc')
    ) === false);

  // 2. Link protocols. Written as a document, so the assertions exercise the
  //    same path a reader's content takes.
  const hostile = [
    '[protocol relative](//malicious.example)',
    '[insecure transport](http://insecure.example)',
    '[secure transport](https://secure.example)',
    '[dangerous scheme](javascript:alert(1))',
    '[internal route](/docs/local-storage)'
  ].join('\n\n');

  await page.evaluate((body) => {
    const field = document.getElementById('editor-source');
    const value = `---\ntitle: Link Audit\ncategory: Operations\nslug: link-audit\n---\n\n${body}\n`;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, hostile);

  await page.waitForSelector('[data-testid="preview-content"]', { timeout: 10_000 });
  await page.locator('[data-testid="editor-save"]').click();
  await page.waitForFunction(() => location.pathname === '/docs/link-audit', null, { timeout: 15_000 });
  await page.waitForSelector('[data-testid="doc-content"]');

  const links = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="doc-content"] a')].map((a) => ({
      href: a.getAttribute('href'),
      target: a.getAttribute('target'),
      rel: a.getAttribute('rel')
    }))
  );

  const protocolRelative = links.find((l) => (l.href ?? '').startsWith('//'));
  check('a protocol-relative link survives compilation',
    protocolRelative !== undefined, JSON.stringify(links));
  check('a protocol-relative link is forced into an isolated tab',
    protocolRelative?.target === '_blank' &&
      (protocolRelative?.rel ?? '') === 'noopener noreferrer',
    JSON.stringify(protocolRelative));
  check('a protocol-relative link is not treated as an in-app route',
    protocolRelative?.target !== null);

  const insecure = links.find((l) => (l.href ?? '').startsWith('http://'));
  check('an http destination is isolated too',
    insecure?.target === '_blank' && (insecure?.rel ?? '').includes('noopener'),
    JSON.stringify(insecure));

  check('no javascript: destination survives anywhere in the document',
    links.every((l) => !(l.href ?? '').toLowerCase().startsWith('javascript:')),
    JSON.stringify(links.map((l) => l.href)));

  const internal = links.find((l) => (l.href ?? '').startsWith('/docs/'));
  check('an internal route is left for the router to handle',
    internal !== undefined && internal.target === null, JSON.stringify(internal));

  check('no page errors', pageErrors.length === 0, pageErrors.join('; '));
  await context.close();
}

// 3. Source hygiene: no pictographic characters anywhere under src/.
{
  section('[hygiene] source contains no Unicode emoji');
  const srcRoot = new URL('../src/', import.meta.url).pathname;
  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  };

  // Extended_Pictographic plus Emoji_Presentation is the standard definition:
  // it covers dingbats, pictographs and regional indicators, and excludes
  // typographic symbols such as arrows, bullets and quotation marks.
  const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu;
  const offenders = [];
  for (const file of walk(srcRoot)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(EMOJI)) {
      offenders.push(
        `${file.slice(srcRoot.length)}:${text.slice(0, match.index).split('\n').length} ` +
          `U+${match[0].codePointAt(0).toString(16).toUpperCase()} ${JSON.stringify(match[0])}`
      );
    }
  }

  check('no Unicode emoji exist under src/', offenders.length === 0, offenders.slice(0, 6).join('; '));
}

await browser.close();
server.close();

console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(` - ${failure}`);
  process.exit(1);
}

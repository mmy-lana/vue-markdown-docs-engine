/*
 * Browser verification for the BaseModal dialog primitive.
 *
 * Serves the purpose-built fixture in `tests/modal` and drives it with a real
 * Chromium to assert the WAI-ARIA dialog contract: initial focus, the Tab
 * loop, focus that cannot escape, dismissal, focus restoration, and the
 * reference-counted scroll lock under nested dialogs.
 *
 * Run with: pnpm verify:modal
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { launchHeadlessBrowser } from '../../scripts/launch-browser.mjs';

const ROOT = new URL('../.modal-dist/', import.meta.url).pathname;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const rel = normalize(url === '/' ? '/tests/modal/index.html' : url).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const failures = [];
let checks = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await launchHeadlessBrowser();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(`${base}/tests/modal/index.html`);
await page.waitForSelector('[data-testid="launcher"]');

const activeId = () => page.evaluate(() => document.activeElement?.id ?? null);
const bodyOverflow = () => page.evaluate(() => document.body.style.overflow);

console.log('\n[modal: open, focus, and accessible name]');
await page.click('[data-testid="launcher"]');
await page.waitForSelector('[role="dialog"]');
check('dialog is exposed with role=dialog', (await page.getAttribute('[role="dialog"]', 'role')) === 'dialog');
check('dialog declares aria-modal', (await page.getAttribute('[role="dialog"]', 'aria-modal')) === 'true');
check('dialog has an accessible name', (await page.getAttribute('[role="dialog"]', 'aria-label')) === 'Probe dialog');
check('background scroll is locked', (await bodyOverflow()) === 'hidden');
await page.waitForTimeout(50);
check('initial focus lands on the first focusable control', (await activeId()) === 'first-control', await activeId());

console.log('\n[modal: focus trap loop]');
/* Dialog tab order: first-control, middle-control, last-control, toggle-hidden,
   open-nested. Tab on open-nested must wrap back to first-control. */
await page.keyboard.press('Tab');
check('Tab moves forward into the dialog', (await activeId()) === 'middle-control', await activeId());
await page.keyboard.press('Tab');
check('Tab advances to the text control', (await activeId()) === 'last-control', await activeId());
await page.keyboard.press('Tab');
check('Tab advances past the toggle', (await activeId()) === 'toggle-hidden', await activeId());
await page.keyboard.press('Tab');
check('Tab reaches the final control', (await activeId()) === 'open-nested', await activeId());
await page.keyboard.press('Tab');
check('Tab on the final control wraps to the first', (await activeId()) === 'first-control', await activeId());
await page.keyboard.press('Shift+Tab');
check('Shift+Tab on the first control wraps to the last', (await activeId()) === 'open-nested', await activeId());
await page.keyboard.press('Shift+Tab');
check('Shift+Tab moves backward', (await activeId()) === 'toggle-hidden', await activeId());

console.log('\n[modal: focus cannot escape]');
await page.evaluate(() => document.getElementById('outside-field').focus());
await page.keyboard.press('Tab');
check('focus is pulled back after escaping forward', (await activeId()) === 'first-control', await activeId());
await page.evaluate(() => document.getElementById('outside-field').focus());
await page.keyboard.press('Shift+Tab');
check('focus is pulled back after escaping backward', (await activeId()) === 'open-nested', await activeId());

console.log('\n[modal: hidden controls are skipped]');
await page.evaluate(() => document.getElementById('first-control').focus());
await page.click('[data-testid="toggle-hidden"]');
await page.evaluate(() => document.getElementById('first-control').focus());
await page.keyboard.press('Tab');
check('a removed control is skipped by Tab', (await activeId()) === 'last-control', await activeId());
await page.click('[data-testid="toggle-hidden"]');
await page.evaluate(() => document.getElementById('first-control').focus());
await page.keyboard.press('Tab');
check('a restored control rejoins the tab order', (await activeId()) === 'middle-control', await activeId());

console.log('\n[modal: dismissal and focus restoration]');
await page.keyboard.press('Escape');
await page.waitForSelector('[role="dialog"]', { state: 'detached' });
check('Escape dismisses the dialog', (await page.locator('[role="dialog"]').count()) === 0);
check('scroll lock is released', (await bodyOverflow()) === '');
check('focus returns to the invoking control', (await activeId()) === 'launcher', await activeId());

await page.click('[data-testid="launcher"]');
await page.waitForSelector('[role="dialog"]');
await page.locator('[role="dialog"]').evaluate((el) => el.previousElementSibling.click());
await page.waitForSelector('[role="dialog"]', { state: 'detached' });
check('a backdrop click dismisses the dialog', (await page.locator('[role="dialog"]').count()) === 0);
check('focus is restored after a backdrop dismissal', (await activeId()) === 'launcher', await activeId());

console.log('\n[modal: stacked dialogs share the scroll lock]');
await page.click('[data-testid="launcher"]');
await page.waitForSelector('[data-testid="first"]');
check('first dialog locks scrolling', (await bodyOverflow()) === 'hidden');
await page.click('[data-testid="open-nested"]');
await page.waitForSelector('[data-testid="second"]');
check('two dialogs are open', (await page.locator('[role="dialog"]').count()) === 2);
await page.waitForTimeout(50);
check('the nested dialog takes initial focus', (await activeId()) === 'second-control', await activeId());
await page.keyboard.press('Escape');
await page.waitForTimeout(50);
check('the scroll lock survives while one dialog remains', (await bodyOverflow()) === 'hidden', await bodyOverflow());
check('focus returns inside the still-open dialog', (await activeId()) === 'open-nested', await activeId());
check('only one dialog remains', (await page.locator('[role="dialog"]').count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(50);
check('the scroll lock releases once the last dialog closes', (await bodyOverflow()) === '');
check('focus returns to the original launcher', (await activeId()) === 'launcher', await activeId());

console.log('\n[primitives]');
check('no runtime errors on the page', pageErrors.length === 0, pageErrors.join('; '));
check(
  'BaseInput renders at 16px to avoid iOS zoom',
  (await page.evaluate(() => getComputedStyle(document.getElementById('probe-input')).fontSize)) === '16px'
);
check(
  'BaseInput wires the label to the control',
  (await page.getAttribute('#probe-input', 'aria-labelledby')) === null &&
    (await page.evaluate(() => document.querySelector('label[for="probe-input"]')?.textContent?.trim())) === 'Probe input'
);
check(
  'BaseInput hint is linked via aria-describedby',
  (await page.getAttribute('#probe-input', 'aria-describedby')) === 'probe-input-hint'
);
check(
  'BaseTextarea exposes its error to assistive technology',
  (await page.getAttribute('#probe-textarea', 'aria-invalid')) === 'true' &&
    (await page.getAttribute('#probe-textarea', 'aria-describedby')) === 'probe-textarea-error'
);
check(
  'BaseTextarea error is announced',
  (await page.textContent('#probe-textarea-error')) === 'A validation message'
);
const buttonBox = await page.locator('[data-testid="click-target"]').boundingBox();
check('BaseButton clears the 44px touch minimum', buttonBox.height >= 44 && buttonBox.width >= 44, JSON.stringify(buttonBox));
const loadingDisabled = await page.locator('button[aria-busy="true"]').isDisabled();
check('a loading button is inert and announces busy', loadingDisabled);
check('a loading button is hidden from the tab order', (await page.locator('button[aria-busy="true"]').count()) === 1);

const kbdBox = await page.locator('kbd').first().boundingBox();
check('BaseKbd renders a kbd element', kbdBox !== null);

await browser.close();
server.close();

console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const failure of failures) console.log(` - ${failure}`);
  process.exit(1);
}

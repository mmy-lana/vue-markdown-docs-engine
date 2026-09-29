import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { launchHeadlessBrowser } from '../../scripts/launch-browser.mjs';

/**
 * Browser verification for the markdown compiler.
 *
 * This fixture exists to lock in the two invariants that are easiest to break
 * and hardest to notice:
 *
 *  1. The heading table stored with a document is byte-identical to the
 *     anchors rendered into its HTML. When those drift apart the table of
 *     contents links to anchors that do not exist.
 *  2. Generated HTML is inert. Raw HTML in a document is escaped, never
 *     parsed, and whatever survives DOMPurify cannot execute.
 *
 * Both need a real DOM, because Shiki colour output and DOMPurify only
 * behave correctly in one. Run with: pnpm verify:parser
 */

const ROOT = new URL('../.parser-dist/', import.meta.url).pathname;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const rel = normalize(url === '/' ? '/tests/parser/index.html' : url).replace(/^(\.\.[/\\])+/, '');
  try { const b = await readFile(join(ROOT, rel)); res.writeHead(200, {'content-type': MIME[extname(rel)] ?? 'application/octet-stream'}); res.end(b); }
  catch { res.writeHead(404).end('nf'); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const ENTRY = process.argv[2] ?? '/tests/parser/index.html';
const fails = []; let n = 0;
const check = (l, ok, d) => { n++; if (ok) console.log('  ok   ' + l); else { fails.push(l); console.log(`  FAIL ${l}${d ? ' — ' + d : ''}`); } };

const browser = await launchHeadlessBrowser();
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}${ENTRY}`);
await page.waitForSelector('[data-testid="content"]');
const r = await page.evaluate(() => window.__probe);
const html = r.sample.html;
const headings = r.sample.headings;

console.log('\n[headings + anchors]');
check('duplicate headings get unique ids in document order',
  headings.map(h => h.id).join(',') === 'h-alpha,h-alpha-2,h-beta', JSON.stringify(headings.map(h=>h.id)));
check('every compiled anchor exists in the html', headings.every(h => html.includes(`id="${h.id}"`)));
check('headings carry doc-heading for scroll-margin', html.includes('doc-heading'));
check('headings carry a permalink', html.includes('heading-anchor'));
check('duplicate anchors really are duplicated in the DOM', (html.match(/id="h-alpha"/g)||[]).length === 1 && (html.match(/id="h-alpha-2"/g)||[]).length === 1);

console.log('\n[code fences]');
check('language label rendered', html.includes('<span>ts</span>'));
check('copy button rendered', html.includes('doc-code-copy-btn'));
check('copy payload uri-encoded', html.includes('data-clipboard="const%20a%3A%20number'));
check('fence opts out of typography', html.includes('not-prose'));
check('dual-theme css variables emitted', html.includes('--shiki-light') && html.includes('--shiki-dark'));
check('fence scrolls horizontally', html.includes('overflow-x-auto'));
const shikiVar = await page.evaluate(() => {
  const span = document.querySelector('.shiki span');
  return span ? getComputedStyle(span).getPropertyValue('--shiki-light').trim() : '';
});
check('shiki css variables resolve in the browser', shikiVar.length > 0, shikiVar);
const codeColor = await page.evaluate(() => {
  const span = document.querySelector('.shiki span');
  return span ? getComputedStyle(span).color : '';
});
check('light theme colour is applied by default', codeColor !== '' && codeColor !== 'rgb(0, 0, 0)', codeColor);
check('unknown language falls back to plain text', html.includes('not-a-real-language') && !html.includes('this is not highlighted'));

console.log('\n[sanitization]');
check('no script element reaches the DOM', (await page.evaluate(() => document.querySelectorAll('script').length)) === 1, 'only the page script itself');
check('no element carries an inline event handler',
  (await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => [...el.attributes].some(a => a.name.startsWith('on'))).length)) === 0);
check('no javascript: href survives',
  (await page.evaluate(() => document.querySelectorAll('a[href^="javascript:"]').length)) === 0);
check('the img injection produced no element',
  (await page.evaluate(() => document.querySelectorAll('[data-testid="content"] img').length)) === 0);
check('injected text is preserved but inert',
  (await page.evaluate(() => document.querySelector('[data-testid="content"]').textContent)).includes('alert(1)'));
check('escaped html survives as text', html.includes('&lt;b&gt;world&lt;/b&gt;'));

console.log('\n[structure]');
check('table wrapped in a scroll container', /<div class="my-6 overflow-x-auto">\s*<table>/.test(html));
check('every div is balanced', (html.match(/<div/g)||[]).length === (html.match(/<\/div>/g)||[]).length, `${(html.match(/<div/g)||[]).length} vs ${(html.match(/<\/div>/g)||[]).length}`);
check('every table is balanced', (html.match(/<table>/g)||[]).length === (html.match(/<\/table>/g)||[]).length);
check('reading time is at least one minute', r.sample.readingTime >= 1, String(r.sample.readingTime));

console.log('\n[dom behaviour]');
const box = await page.locator('.doc-code-card .overflow-x-auto').first().boundingBox();
check('code card is laid out', box !== null && box.width > 0);
const linkTarget = await page.evaluate(() => {
  const a = document.querySelector('[data-testid="content"] a[href^="https"]');
  return a ? a.getAttribute('href') : null;
});
check('external links survive sanitization', linkTarget === 'https://example.com', String(linkTarget));

console.log('\n[prototype pollution defense]');
// The parser is reached through the bundled page rather than a Node import:
// `@` is a Vite alias and does not resolve outside the bundler. The calls
// below therefore execute the same module the application ships.
const probeFrontmatter = (raw) =>
  page.evaluate((source) => window.__probe.probeFrontmatter(source), raw);

for (const key of ['__proto__', 'constructor', 'prototype']) {
  const source = `---\ntitle: A\ncategory: B\nslug: a-b\n${key}: malicious\n---\n# Body\n`;
  const result = await probeFrontmatter(source);
  check(`frontmatter declaring ${key} is rejected`,
    !result.ok && result.message.includes('forbidden property name'), JSON.stringify(result));
  check(`the ${key} error names the offending key`, result.message.includes(key), result.message);
}

const legitimate = await probeFrontmatter('---\ntitle: A\ncategory: B\nslug: a-b\n---\n# Body\n');
check('a legitimate frontmatter block still parses', legitimate.ok && legitimate.title === 'A', JSON.stringify(legitimate));

check('a non-mapping frontmatter block is rejected',
  !(await probeFrontmatter('---\n- a\n- b\n---\n# Body\n')).ok);
check('a missing fence is rejected',
  !(await probeFrontmatter('# Body, no frontmatter at all\n')).ok);

check('Object.prototype was not polluted by any of the above',
  (await page.evaluate(() => window.__probe.isPrototypePolluted())) === false);

const replaced = await page.evaluate(() => window.__probe.probeReplacedPrototype());
check('a polluted prototype is rejected even without a forbidden key',
  !replaced.ok && replaced.message.includes('replaced prototype'), JSON.stringify(replaced));

console.log('\n[seed corpus]');
check('all seven seeds compiled', r.seeds.length === 7, String(r.seeds.length));
for (const s of r.seeds) {
  check(`${s.slug}: compiled headings match stored`, JSON.stringify(s.stored) === JSON.stringify(s.compiled),
    JSON.stringify(s.compiled.map(h=>h.id)) + ' vs ' + JSON.stringify(s.stored.map(h=>h.id)));
  check(`${s.slug}: html non-empty, no script`, s.htmlLength > 0 && !s.hasScript);
}
check('no page errors', errs.length === 0, errs.join('; '));

await browser.close(); server.close();
console.log(`\n${fails.length === 0 ? 'PASS' : 'FAIL'} — ${n - fails.length}/${n}`);
if (fails.length) { fails.forEach(f => console.log(' - ' + f)); process.exit(1); }

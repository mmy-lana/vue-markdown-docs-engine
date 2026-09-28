import type { DocItem } from '@/types';
import { extractFrontmatterSync, extractHeadingsSync } from '@/composables/useMarkdownParser';

/**
 * Seed revision for the bundled corpus.
 *
 * Reconciliation overwrites a stored document with the seed only when the
 * document is not user modified and carries a lower `seedVersion`. Bump this
 * constant whenever a seed document's content changes so that existing
 * visitors receive the updated copy.
 */
export const SEED_VERSION = 1;

/** Fallback timestamp for seeds whose `lastModified` is not a parsable date. */
const SEED_EPOCH = Date.parse('2026-01-05T00:00:00.000Z');

/** Input for a single bundled document: a stable id plus its source text. */
interface SeedDocSource {
  id: string;
  rawContent: string;
}

/**
 * Removes the shared indentation of a template literal so documents can be
 * authored flush with the surrounding code.
 */
function dedent(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => (/^[ \t]*/.exec(line)?.[0].length ?? 0));
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return `${lines.map((line) => line.slice(minIndent)).join('\n').trim()}\n`;
}

/**
 * Materialises a seed document.
 *
 * Every derived field — title, description, category, order, slug, tags,
 * lastModified and the heading table — is read back out of the document's own
 * frontmatter and body. A seed therefore cannot describe itself inconsistently,
 * and the stored heading ids are produced by the exact same slugifier the
 * compile pipeline uses when it renders the anchors.
 */
function createSeedDoc(source: SeedDocSource): DocItem {
  const { frontmatter, body } = extractFrontmatterSync(source.rawContent);
  const parsedTimestamp = Date.parse(frontmatter.lastModified);

  return {
    id: source.id,
    slug: frontmatter.slug,
    title: frontmatter.title,
    description: frontmatter.description,
    category: frontmatter.category,
    order: frontmatter.order,
    rawContent: source.rawContent,
    headings: extractHeadingsSync(body),
    tags: frontmatter.tags,
    lastModified: frontmatter.lastModified,
    updatedAt: Number.isNaN(parsedTimestamp) ? SEED_EPOCH : parsedTimestamp,
    seedVersion: SEED_VERSION,
    isUserModified: false,
    isDraft: false
  };
}

const GETTING_STARTED = dedent(`
  ---
  title: Getting Started
  description: Install the engine, boot the dev server, and publish your first documentation page.
  category: Getting Started
  order: 10
  slug: getting-started
  tags:
    - setup
    - onboarding
    - quickstart
  lastModified: 2026-01-12
  ---

  The engine is a client-side documentation wiki. Markdown is compiled in the browser and every document is persisted to \`localStorage\`, so there is no server, no database and nothing to deploy.

  ## Prerequisites

  You need a current Node.js runtime and a package manager.

  | Requirement | Version | Notes |
  | --- | --- | --- |
  | Node.js | 20 or newer | Provides the ESM and fetch primitives the highlighter relies on |
  | pnpm | 9 or newer | Resolves the lockfile that pins the whole toolchain |

  ## Installation

  Clone the repository and install the dependency graph.

  \`\`\`bash
  pnpm install
  \`\`\`

  The lockfile is committed. Always install with \`pnpm install\` so the resolved versions stay reproducible across machines.

  ## Running the development server

  \`\`\`bash
  pnpm dev
  \`\`\`

  Vite serves the application with hot module replacement. Editing a component updates the browser without losing your localStorage state.

  ### Verifying the toolchain

  Run the type checker before you commit. It compiles every \`.ts\` and \`.vue\` file in one pass.

  \`\`\`bash
  pnpm typecheck
  \`\`\`

  A production build runs the same check and then bundles the application.

  \`\`\`bash
  pnpm build
  \`\`\`

  ## Creating your first document

  1. Select **Edit / New** in the header to open the editor.
  2. Choose a template or start from an empty document.
  3. Write YAML frontmatter followed by markdown.
  4. Select **Save** to compile and publish the page.

  ### The frontmatter contract

  Every document opens with a fenced YAML block. The engine validates it before anything is persisted.

  \`\`\`yaml
  ---
  title: Release Checklist
  description: Everything that must pass before a release is cut.
  category: Operations
  order: 40
  slug: release-checklist
  tags:
    - process
  lastModified: 2026-03-02
  ---
  \`\`\`

  \`title\`, \`category\` and \`slug\` are mandatory. A slug must be lowercase kebab-case and unique across the corpus.

  ## Next steps

  Read [Project Structure](/docs/project-structure) for the module layout, then [Markdown Rendering](/docs/markdown-rendering) to understand how a document becomes HTML.
`);

const PROJECT_STRUCTURE = dedent(`
  ---
  title: Project Structure
  description: How the source tree is organised, from the type model up to the routed views.
  category: Getting Started
  order: 20
  slug: project-structure
  tags:
    - architecture
    - layout
  lastModified: 2026-01-15
  ---

  The engine is deliberately small. Four composables own all behaviour, a handful of components render it, and one composable owns persistence.

  ## Directory layout

  \`\`\`text
  src/
    components/
      domain/      Application shell: header, sidebar, editor, renderer
      molecules/   Reusable content pieces: breadcrumbs, pager, table of contents
      ui/          Accessible primitives: button, input, modal, badge
    composables/   useDocStorage, useMarkdownParser, useDocSearch, ...
    data/          The bundled seed corpus
    layouts/       DocsLayout and its three-column geometry
    router/        Route table
    types/         The shared domain model
    views/         Routed pages
  \`\`\`

  ### The layers

  1. **Types** declare the domain model and have no framework dependencies.
  2. **Composables** own state, parsing and persistence. They are the only layer allowed to import each other freely.
  3. **Components** render state and emit intent. They never write to storage directly.
  4. **Views** compose components and wire route parameters to composables.

  ## Routing

  A single dynamic route renders every document.

  \`\`\`typescript
  const routes: RouteRecordRaw[] = [
    { path: '/', redirect: '/docs/getting-started' },
    { path: '/docs/:slug', name: 'DocView', component: DocView },
    { path: '/:pathMatch(.*)*', name: 'NotFound', component: DocView }
  ];
  \`\`\`

  The catch-all intentionally reuses the document view: an unknown slug renders the engine's own not-found state rather than a dead end.

  ### Scroll behaviour

  Navigation restores the saved position when the browser provides one, honours an incoming hash, and otherwise returns to the top of the page.

  ## Data flow

  \`\`\`text
  useDocStorage  ──▶  docs: DocItem[]
        │                  │
        │                  ├──▶ useDocNavigation ──▶ sidebar, pager
        │                  ├──▶ useDocSearch     ──▶ search palette
        │                  └──▶ useMarkdownParser ─▶ CompiledDoc
        │                                              │
        └──▶ localStorage                               ▼
                                                  DocView
  \`\`\`

  ## Build output

  Vite emits hashed static assets into \`dist\`. Because the whole application is client-rendered, any static host is sufficient.
`);

const MARKDOWN_RENDERING = dedent(`
  ---
  title: Markdown Rendering
  description: The compile pipeline, from raw markdown to sanitized dual-theme HTML.
  category: Core Concepts
  order: 10
  slug: markdown-rendering
  tags:
    - markdown
    - rendering
    - shiki
    - security
  lastModified: 2026-01-20
  ---

  Compiling a document is asynchronous because syntax highlighting loads a WebAssembly grammar bundle on first use. The result is cached, so only the first document in a session pays the cost.

  ## The compile pipeline

  \`\`\`typescript
  const result = await compileDoc(doc);
  // result.htmlContent        sanitized HTML
  // result.headings           authoritative anchor table
  // result.readingTimeMinutes ceil(words / 200)
  \`\`\`

  Raw HTML is disabled at the parser level, so a document can never inject markup that the sanitizer has to reason about.

  ## Fenced code blocks

  Every fence is replaced with a card that carries a language label, a copy button and a horizontally scrollable body. The payload for the copy button travels in a \`data-clipboard\` attribute and is decoded on click.

  \`\`\`typescript
  import { useDocStorage } from '@/composables/useDocStorage';

  const { saveDoc } = useDocStorage();
  const outcome = saveDoc(markdown, existingId);
  \`\`\`

  ### Unknown languages

  A fence whose language is not loaded falls back to plain text rather than failing the render. The example below shows a fence for a grammar that is not bundled.

  \`\`\`\`text
  \`\`\`
  this-language-does-not-exist
  \`\`\`
  \`\`\`\`

  ## Headings and anchors

  Level 2 to 4 headings are collected in document order. Anchors are prefixed with \`h-\` and duplicates are suffixed numerically, so two sections called **Overview** resolve to \`h-overview\` and \`h-overview-2\`.

  1. The first occurrence keeps the bare anchor.
  2. Later occurrences append \`-2\`, \`-3\`, and so on.
  3. Unicode letters survive normalisation, so non-Latin headings remain readable in the URL.

  ### Why the extractor and the renderer share a slugifier

  Heading ids are computed twice: once when a document is saved and once when it is rendered. If the two paths disagreed, the table of contents would link to anchors that do not exist. Both paths therefore call the same pure function and read the same text extraction.

  | Source | Heading text | Generated id |
  | --- | --- | --- |
  | \`## Install deps\` | Install deps | \`h-install-deps\` |
  | \`## Install deps\` (second) | Install deps | \`h-install-deps-2\` |
  | \`## **Bold** title\` | Bold title | \`h-bold-title\` |

  ## Tables

  Tables are wrapped in a scroll container so that wide grids never widen the page on a narrow viewport.

  ## Sanitization

  Generated HTML is passed through DOMPurify before it reaches the document. Only the attributes the engine itself emits survive, which keeps the rendered output free of event handlers and \`javascript:\` URLs.
`);

const FRONTMATTER_SCHEMA = dedent(`
  ---
  title: Frontmatter Schema
  description: Every field the engine understands, whether it is required, and how it is validated.
  category: Core Concepts
  order: 20
  slug: frontmatter-schema
  tags:
    - reference
    - yaml
    - validation
  lastModified: 2026-01-22
  ---

  Frontmatter is the document's contract. It is parsed, validated and projected onto the navigation tree, the search index and the rendered header.

  ## Required fields

  Three fields must be present or the save is rejected with a message naming the offending key.

  - \`title\` — non-empty string, shown in the header, the sidebar and search results.
  - \`category\` — non-empty string, becomes a navigation group.
  - \`slug\` — lowercase kebab-case and unique across the corpus.

  ## Optional fields

  | Field | Type | Default | Effect |
  | --- | --- | --- | --- |
  | \`description\` | string | empty | Subtitle under the title and the search snippet |
  | \`order\` | number | 100 | Sort weight inside the category |
  | \`tags\` | string list | empty | Searchable keywords |
  | \`lastModified\` | ISO date string | save time | Rendered in the document header |

  ## Validation rules

  ### Slug format

  A slug matches the following pattern, which permits lowercase letters, digits and single interior hyphens.

  \`\`\`text
  ^[a-z0-9]+(?:-[a-z0-9]+)*$
  \`\`\`

  \`Project Structure\`, \`project_structure\` and \`-project\` are all rejected. \`project-structure\` is accepted.

  ### Uniqueness

  Slugs address documents by URL, so a collision is fatal. The save fails and names the document that already owns the slug.

  \`\`\`typescript
  const collision = docs.value.find(
    (doc) => doc.slug === frontmatter.slug && doc.id !== existingId
  );
  if (collision) {
    return { success: false, error: \`Slug "\${frontmatter.slug}" is already in use.\` };
  }
  \`\`\`

  ### Type errors

  A field of the wrong type is reported rather than coerced, so \`order: "10"\` is an error instead of a silent surprise.

  ## Recipes

  ### A reference page

  \`\`\`yaml
  ---
  title: Troubleshooting
  description: Failure modes and the fix for each one.
  category: Reference
  order: 20
  slug: troubleshooting
  tags:
    - support
  lastModified: 2026-01-28
  ---
  \`\`\`

  ### An operations page

  \`\`\`yaml
  ---
  title: Release Checklist
  description: Everything that must pass before a release is cut.
  category: Operations
  order: 40
  slug: release-checklist
  tags:
    - process
    - release
  lastModified: 2026-03-02
  ---
  \`\`\`
`);

const LOCAL_STORAGE = dedent(`
  ---
  title: Local Storage
  description: The persisted payload, seed reconciliation, deletion tombstones and multi-tab behaviour.
  category: Core Concepts
  order: 30
  slug: local-storage
  tags:
    - persistence
    - storage
    - reconciliation
  lastModified: 2026-01-25
  ---

  The engine persists one JSON payload under a single key. Every mutation writes the whole payload, which keeps the on-disk shape trivially inspectable and makes atomic replacement possible.

  ## The payload

  \`\`\`typescript
  interface DocStoragePayload {
    schemaVersion: number;
    docs: DocItem[];
    drafts: Record<string, DocDraft>;
    deletedAtMap: Record<string, number>;
    recentSearches: string[];
  }
  \`\`\`

  ## Write before commit

  Mutations never update reactive state optimistically. The engine serialises the next payload, attempts the write, and only assigns the resulting arrays to the reactive refs once the write has succeeded.

  \`\`\`typescript
  const persisted = writeToLocalStorage(nextDocs, nextDrafts, nextDelMap, recentSearches.value);
  if (!persisted) {
    return { success: false, error: 'Storage quota exceeded.' };
  }

  docs.value = nextDocs;
  \`\`\`

  This ordering guarantees the interface and the disk never disagree. A failed write leaves the previous state fully intact and surfaces a real error rather than a phantom success.

  ## Seed reconciliation

  On load the persisted corpus is reconciled against the bundled seeds.

  1. A seed the visitor deleted is skipped.
  2. A seed that is missing from storage is appended.
  3. A seed the visitor edited is never overwritten.
  4. A pristine seed from an older \`seedVersion\` is upgraded.

  ### Deletion tombstones

  Deleting a seed writes its id into \`deletedAtMap\`. Without the tombstone the next reconciliation would resurrect the document, because reconciliation re-adds any seed that is absent from storage.

  ## Multi-tab synchronisation

  The \`storage\` event fires in every tab except the one that performed the write. Each receiving tab reloads and reconciles the payload.

  1. **Last write wins.** The whole snapshot is replaced; individual fields are not merged.
  2. **Reconciliation is idempotent.** Running it twice in a row produces the same state.
  3. **No write loop.** A tab persists only when reconciliation actually changed something.

  ## Recovery

  A payload that fails to parse is copied to a backup key before the engine falls back to the seed corpus. Inspecting the backup key recovers a corpus that a schema change would otherwise have discarded.
`);

const COMPOSABLES_API = dedent(`
  ---
  title: Composables API
  description: The public surface of every composable, with its inputs, outputs and side effects.
  category: Reference
  order: 10
  slug: composables-api
  tags:
    - reference
    - api
  lastModified: 2026-01-30
  ---

  Six composables make up the entire behavioural surface of the engine.

  ## useDocStorage

  Owns the corpus, drafts, deletion tombstones and recent searches.

  \`\`\`typescript
  const { docs, drafts, recentSearches, saveDoc, deleteDoc, saveDraft } = useDocStorage();
  \`\`\`

  \`saveDoc\` returns a discriminated result. On failure it carries a message that is safe to display verbatim in the editor.

  ## useMarkdownParser

  \`\`\`typescript
  const { compileDoc, isCompiling } = useMarkdownParser();
  const compiled = await compileDoc(doc);
  \`\`\`

  The highlighter is created once and shared. A second concurrent compile reuses the in-flight promise instead of instantiating a second WebAssembly bundle.

  ## useDocSearch

  Builds the index reactively from the corpus and scores a debounced query against it.

  \`\`\`typescript
  const { query, searchResults } = useDocSearch();
  \`\`\`

  Matching is Unicode aware and short technical tokens such as \`c\`, \`r\` and \`go\` are indexed so that language names are reachable.

  ## useDocNavigation

  Groups published documents by category and computes the previous and next links for the pager.

  \`\`\`typescript
  const { groups, activeDoc, pager } = useDocNavigation();
  \`\`\`

  ## useTableOfContents

  Tracks the heading currently in view with an \`IntersectionObserver\` and disconnects it when the component unmounts.

  \`\`\`typescript
  const { activeHeadingId, initObserver, cleanupObserver } = useTableOfContents();
  \`\`\`

  ## useTheme

  Owns the light and dark preference and mirrors it onto the \`dark\` class on the document element.

  ### Avoiding a flash of the wrong theme

  A tiny blocking script in the document head applies the stored preference before the first paint. The composable only needs to keep that class in sync afterwards.
`);

const TROUBLESHOOTING = dedent(`
  ---
  title: Troubleshooting
  description: Failure modes the engine can surface, and the fix for each one.
  category: Reference
  order: 20
  slug: troubleshooting
  tags:
    - support
    - errors
  lastModified: 2026-02-02
  ---

  Every failure in the engine surfaces as a message, a state or a log entry rather than a blank screen.

  ## The document view is empty

  A slug that matches no published document renders the not-found state. Check three things in order.

  1. The URL matches the \`slug\` in the frontmatter exactly.
  2. The document is not a draft.
  3. The document was not deleted, which leaves a tombstone in \`deletedAtMap\`.

  ## Saving fails immediately

  The message names the problem.

  | Message | Cause | Fix |
  | --- | --- | --- |
  | Missing a YAML frontmatter boundary | No opening \`---\` fence | Add the fence as the first line |
  | \`"title" is required\` | Title absent or blank | Provide a non-empty title |
  | \`"slug" must be lowercase kebab-case\` | Slug has spaces, capitals or underscores | Convert it to kebab-case |
  | Slug already in use | Another document owns the slug | Choose a different slug |
  | Storage quota exceeded | The browser refused the write | Delete drafts or unused documents |

  ## Code blocks are not highlighted

  Highlighting runs once per session and the first compile is the slow one. If a fence still renders unstyled, its language is not loaded and the engine fell back to plain text on purpose.

  ## Duplicate anchors

  Repeating a heading is safe. The first occurrence keeps the plain anchor and each later one is suffixed, so a document containing **Overview** twice produces \`h-overview\` and \`h-overview-2\`.

  ### Table of contents links go nowhere

  The anchor ids stored with the document and the ids rendered into the HTML are produced by the same slugifier in the same document order. A stale link means the document was written by an older build; save it again to refresh the stored heading table.

  ## A flash of the light theme on load

  The blocking script in the document head reads the stored preference before first paint. A flash means the preference could not be read, usually because storage is blocked in private browsing. In that case the engine falls back to the operating system preference.

  ## Recovering a corrupted corpus

  A payload that cannot be parsed is copied to the backup key before the engine falls back to the seed corpus.

  \`\`\`javascript
  const raw = localStorage.getItem('vue_docs_engine_v1_backup');
  console.log(raw ? JSON.parse(raw).docs.length : 'no backup found');
  \`\`\`
`);

/**
 * The bundled corpus, in stable order. Seed ids never change: they are the
 * join key used by {@link DocStoragePayload.deletedAtMap} and by the search
 * index, so renaming one would orphan a visitor's tombstones.
 */
export const SEED_DOCS: readonly DocItem[] = Object.freeze([
  createSeedDoc({ id: 'seed-getting-started', rawContent: GETTING_STARTED }),
  createSeedDoc({ id: 'seed-project-structure', rawContent: PROJECT_STRUCTURE }),
  createSeedDoc({ id: 'seed-markdown-rendering', rawContent: MARKDOWN_RENDERING }),
  createSeedDoc({ id: 'seed-frontmatter-schema', rawContent: FRONTMATTER_SCHEMA }),
  createSeedDoc({ id: 'seed-local-storage', rawContent: LOCAL_STORAGE }),
  createSeedDoc({ id: 'seed-composables-api', rawContent: COMPOSABLES_API }),
  createSeedDoc({ id: 'seed-troubleshooting', rawContent: TROUBLESHOOTING })
]);

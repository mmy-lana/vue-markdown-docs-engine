# vue-markdown-docs-engine

A client-side documentation wiki and markdown engine built with Vue 3, Tailwind CSS v4, Vite, and Shiki. Features dual-theme syntax highlighting, client-side token search, table of contents synchronization, and browser-local document drafting with frontmatter validation.

* **Live Demo:** [vue-markdown-docs-engine.vercel.app](https://vue-markdown-docs-engine.vercel.app)
* **Repository:** [github.com/mmy-lana/vue-markdown-docs-engine](https://github.com/mmy-lana/vue-markdown-docs-engine)

---

## Features

* **Browser-Native Markdown Compilation:** Compiles raw Markdown with frontmatter using `markdown-it`, `markdown-it-anchor`, and `DOMPurify` with raw HTML execution disabled.
* **Dual-Theme Syntax Highlighting:** Zero-runtime-flash syntax highlighting powered by `shiki/core` using JavaScript regex execution and CSS custom variables (`github-light` and `github-dark`).
* **Stripe/Tailwind Docs 3-Column Layout:** Sticky top header, fixed collapsible category sidebar, prose stream, and right-rail table of contents spy.
* **Command Palette Search (Cmd+K):** Debounced, Unicode-aware in-memory forward token index following the W3C WAI-ARIA 1.2 Combobox pattern.
* **In-App Composer & Wiki Editor:** Tabbed editor below `md` breakpoint, side-by-side live split-view on desktop, with frontmatter validation and auto-slugification.
* **Local Storage & State Synchronization:** Atomic write-before-commit persistence with 500 KB per-document and 4 MB total corpus quota guards, 30-day tombstone compaction, and multi-tab `storage` event synchronization.
* **Hardened Security & Isolation:** Sanitized link delegation blocking protocol-relative URLs (`//`) and hazardous URI schemes (`javascript:`, `data:`, `vbscript:`), prototype pollution key rejection (`__proto__`, `constructor`, `prototype`), and CSP compliance.
* **Responsive & Accessible:** Strict mobile viewport validation (360px, 390px, 430px, 768px, 1024px, 1280px+), reference-counted scroll locking, focus traps, and minimum 44x44px touch targets.

---

## Tech Stack

* **Framework:** Vue 3 (Composition API, `<script setup lang="ts">`)
* **Styling:** Tailwind CSS v4 with `@tailwindcss/vite` and `@tailwindcss/typography`
* **Build Tool:** Vite
* **Type System:** TypeScript (strict mode, `noUncheckedIndexedAccess: true`)
* **Markdown Parser:** `markdown-it`, `markdown-it-anchor`
* **Syntax Highlighter:** `shiki` (fine-grained core with dynamic language loading)
* **Sanitization:** `DOMPurify`
* **Data Serializer:** `yaml`
* **E2E Testing:** Playwright

---

## Project Structure

```text
src/
├── components/
│   ├── domain/             # Shell landmarks (DocHeader, DocSidebar, DocContentRenderer, DocEditorModal)
│   ├── molecules/          # Content molecules (Breadcrumb, DocPager, TableOfContents, SearchModal, MobileTocAccordion)
│   └── ui/                 # Accessible primitives (BaseButton, BaseInput, BaseTextarea, BaseModal, BaseBadge, BaseKbd)
├── composables/            # Headless composables (useDocStorage, useMarkdownParser, useDocSearch, useTheme, etc.)
├── data/                   # Bundled seed documents (seedDocs.ts)
├── layouts/                # DocsLayout 3-column responsive shell
├── router/                 # Vue Router configuration
├── types/                  # Pure TypeScript domain models
├── views/                  # DocView routed document stream
├── App.vue                 # Root view component
├── main.ts                 # Application entry point
└── style.css               # Tailwind v4 configuration and Shiki CSS custom properties
```

---

## Getting Started

### Prerequisites

* Node.js 20 or newer
* pnpm 9 or newer

### Installation

```bash
git clone https://github.com/mmy-lana/vue-markdown-docs-engine.git
cd vue-markdown-docs-engine
pnpm install
```

### Development

Start the local development server with hot module replacement:

```bash
pnpm dev
```

### Production Build

Type check and bundle static assets for production:

```bash
pnpm build
```

Preview the local production build:

```bash
pnpm preview
```

---

## Testing & Quality Gates

Run the verification suite (strict TypeScript checks, parser tests, modal accessibility tests, and multi-viewport Playwright matrix):

```bash
# Type check TypeScript and Vue SFCs
pnpm typecheck

# Execute dialog accessibility suite (focus trap, scroll lock, keyboard navigation)
pnpm verify:modal

# Execute markdown compiler and sanitization probe
pnpm verify:parser

# Execute full viewport matrix E2E tests (360px - 1440px)
pnpm verify:e2e

# Run the complete test gate
pnpm verify
```

---

## Frontmatter Specification

Every document must begin with a fenced YAML frontmatter block adhering to the following schema:

```yaml
---
title: Getting Started
description: Quick start guide for configuring and deploying the engine.
category: Fundamentals
order: 10
slug: getting-started
tags:
  - onboarding
  - quickstart
lastModified: 2026-09-28
---
```

* `title`: Required non-empty string.
* `category`: Required non-empty string. Used for sidebar grouping.
* `slug`: Required lowercase kebab-case string (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`). Must be unique across the corpus.
* `order`: Optional number used for sorting category groups and items (default: `100`).
* `description`: Optional string rendered under the document title and in search results.
* `tags`: Optional list of strings indexed by client-side search.
* `lastModified`: Optional ISO date string.

---

## Storage & Persistence Limits

* **Max Document Size:** 500 KB (512,000 UTF-16 code units) per document.
* **Corpus Storage Budget:** 4 MB (4,096,000 UTF-16 code units) aggregate.
* **Tombstone Compaction:** Deletion markers older than 30 days are purged automatically, while seed tombstones remain permanent to prevent seed resurrection.
* **Multi-Tab Sync:** Synchronized across browser tabs via Last-Write-Wins (LWW) snapshot replacement on `window.storage` events.

---

## License

MIT

---

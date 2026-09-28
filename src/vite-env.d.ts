/// <reference types="vite/client" />

/**
 * `.vue` single-file components are typed by `vue-tsc` directly. Declaring a
 * `*.vue` module shim here would shadow the real SFC types and silently drop
 * prop, emit and slot checking in every consuming component, so the project
 * intentionally relies on the language plugin instead.
 */

# @meru/dark-theme

Apply a dark theme to any DOM element and its subtree — colors, gradients, and
images — with good contrast, without touching the rest of the document. A small,
element-scoped adaptation of
[Dark Reader](https://github.com/darkreader/darkreader)'s dynamic-mode color and
image logic.

## Usage

```ts
import { applyDarkTheme } from "@meru/dark-theme";

const controller = applyDarkTheme(element);

// when the subtree is discarded (e.g. removed from the DOM):
controller.destroy();

// or, to undo theming on a still-live subtree:
controller.revert();
```

Runs in a DOM context (it uses `getComputedStyle`, `<canvas>`, and `Image`), so
use it in a renderer or content script, not the Electron main process.

## Options

`applyDarkTheme(root, options?)` — `options` is a partial `Theme` plus a couple of
engine flags:

- `darkSchemeBackgroundColor` / `darkSchemeTextColor` — the HSL poles that light
  colors are remapped toward. Default `#181a1b` / `#e8e6e3`.
- `brightness` / `contrast` / `sepia` / `grayscale` — filter adjustments applied on
  top of the remap. Default `100` / `100` / `0` / `0`.
- `ignore?: Array<string | { selector: string; properties: string[] }>` — opt elements
  out of theming. A **string** selector keeps its matching elements and their descendants
  (via `closest`) fully original — e.g. coloured chips or badges. An **object** skips only
  the listed `properties` on elements matching its `selector` (via `matches`), leaving those
  to CSS — e.g. `{ selector: ".foo", properties: ["border-color"] }` lets a stylesheet set
  the border colour, which the engine's inline override would otherwise win over.
  `"border-color"` covers all four sides. The skip applies across every path the engine
  darkens a property from — the inline override, `::before`/`::after` pseudo rules, and the
  darkened `:hover`/`:focus` state rules — so an ignored property stays with CSS in every
  state.
- `observe?: boolean` — watch the subtree and keep theming content added later, and
  re-theme an element when its class changes (so state-driven styles, like a shadow
  a sticky toolbar gains on scroll, are darkened too). Defaults to `true`; call
  `revert()` or `destroy()` to disconnect.
- `css?: string` — CSS injected into the document while the theme is active and
  removed on `revert()`/`destroy()`. Use it for rules the inline-override engine can't
  reach — `:hover`/`:focus` backgrounds, `::before` icons — scoped with the
  `[data-dark-theme]` attribute so they apply only where the engine has themed.
- `invertImageUrls?: string[]` — URL prefixes of dark monochrome icons (an element's
  `background-image`, or a pseudo-element's `content`/`background-image`) to
  blank-invert with `filter: invert(1)`. A pragmatic stand-in for pixel analysis when
  the icon is cross-origin (CORS-tainted) and can't be inspected — e.g. a site's
  material-icon CDN path. Matched by `startsWith`.
- `invertImageExcludeFilenames?: string[]` — filenames (the last path segment of the
  url) that `invertImageUrls` should skip even when their prefix matches — for a
  coloured icon variant sharing the same path as the monochrome ones, which inverting
  would wrongly recolour.

## Controller

- `revert()` — disconnect the observer, restore every element's original inline
  styles, and release references. Use on a **still-live** subtree.
- `destroy()` — disconnect the observer and release references **without** restoring
  styles. Use when the subtree is being discarded (restoring would be wasted work).

## Behavior notes

- Light-valued CSS custom properties declared or referenced in the document's
  **same-origin** stylesheets are darkened and re-declared scoped to
  `[data-dark-theme]`, so surfaces painted via `var(--token)` are covered even in
  states the element walk never observes (a variable inherits, so the dark value
  cascades into the themed subtree and stops at its boundary). Properties declared
  only in cross-origin stylesheets are missed (the same CORS wall as images). A
  `css` override for the same property still wins, so hand-tune exceptions there.
- `::before`/`::after` pseudo-elements are darkened too: their non-inheriting paint
  (background, border, box-shadow, and gradient background-images) is remapped and
  emitted into an injected stylesheet keyed to the owning element. Their `color`
  isn't touched — it inherits the element's own themed color. A pseudo **content
  image** can't be colour-inspected when it's cross-origin (the same CORS limit as
  `<img>`); if its URL matches `invertImageUrls` it's blank-inverted, otherwise left
  alone. The invert decision is re-evaluated when the element's class/state changes, so an
  icon whose URL swaps on toggle (e.g. a star) gains or loses the invert to match.
- `:hover`/`:focus`/`:active` styles — which a computed-style snapshot can't see,
  since the state isn't active at theme time — are read from the document's
  **same-origin** author rules, darkened, and re-emitted with each selector kept
  verbatim inside a CSS `@scope (root)` block, so they apply only within the themed
  subtree. Rules declared only in cross-origin stylesheets are missed (same CORS
  limit).
- Colors apply synchronously; image analysis resolves shortly after (async).
- Idempotent — re-invoking only themes not-yet-themed elements, so it's safe to call
  again as the subtree grows.
- Overrides are inline `!important`; use `ignore` for elements that must keep their
  own colors (a stylesheet rule can't override an inline `!important`).
- Cross-origin images need CORS to be analyzed; otherwise they're left untouched.

## Attribution

Adapts Dark Reader (MIT). See [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

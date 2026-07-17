# @meru/dark-theme

Apply a dark theme to any DOM element and its subtree — colors, gradients, and
images — with good contrast, without touching the rest of the document.

## Usage

```ts
import { applyDarkTheme } from "@meru/dark-theme";

const controller = applyDarkTheme(element);

// when the subtree is discarded (e.g. removed from the DOM):
controller.destroy();

// or, to undo theming on a still-live subtree:
controller.revert();
```

Runs in a DOM context (it uses the CSSOM, `<canvas>`, and `Image`), so use it
in a renderer or content script, not the Electron main process. Chromium only.

## Options

`applyDarkTheme(root, options?)` — `options` is a partial `Theme` plus a couple of
engine flags:

- `backgroundColor` / `textColor` — the HSL poles that light colors are remapped
  toward. Default `#181a1b` / `#e8e6e3`.
- `brightness` / `contrast` / `sepia` / `grayscale` — filter adjustments applied on
  top of the remap. Default `100` / `100` / `0` / `0`.
- `ignore?: Array<string | { selector: string; properties: string[] }>` — opt elements
  out of theming. A **string** selector keeps its matching elements and their descendants
  fully original (the generated rules exclude them via `:not()` and the inline pass skips
  them) — e.g. coloured chips or badges. An **object** skips only the listed
  `properties` on elements matching its `selector` (via `matches`), leaving those to CSS —
  the inline pass skips them, and the instance sheet re-emits the original stylesheet
  values for them so the shared darkened rules lose. `"border-color"` covers all four
  sides.
- `observe?: boolean` — watch the subtree and keep theming content added later.
  Defaults to `true`; call `revert()` or `destroy()` to disconnect.
- `css?: string` — CSS injected into the document while the theme is active and
  removed on `revert()`/`destroy()`. Use it for hand-tuned overrides, scoped with the
  `[data-dark-theme]` attribute (stamped on every themed element) — the attribute's
  extra specificity plus the late injection order make these rules win over the
  generated values.
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

- `revert()` — disconnect the observers, remove the generated stylesheets, restore
  every touched style attribute, and release references. Use on a **still-live**
  subtree.
- `destroy()` — disconnect and remove the generated stylesheets **without** restoring
  attributes. Use when the subtree is being discarded (restoring would be wasted work).

## How it works

Two cooperating layers, modeled on Dark Reader's dynamic engine but scoped to a
target element:

- **Scoped stylesheet re-emission.** The document's same-origin stylesheets are
  walked and every color-bearing declaration is re-emitted darkened into one shared
  injected sheet, each selector anchored with an
  `:is([data-dark-theme-root^="…"], [data-dark-theme-root^="…"] *)` suffix so the
  copies apply only inside themed subtrees (`@scope` can't serve this: its scoping
  root is only matchable by `:scope`, and Gmail selectors name the root's own
  classes). The suffix adds the same specificity to every copy, so the copies'
  relative cascade order mirrors the originals'. Selectors are otherwise verbatim, so
  `:hover`/`:focus`/`:active`, `::before`/`::after`, and `::selection` styles are
  covered natively — no state simulation. Custom properties are typed by the
  properties that consume them (background/text/border/image, with one hop of
  var-to-var propagation) and re-declared darkened with the matching pole; untyped
  variables are left alone. Source `!important` is mirrored, so the page's own
  cascade ordering is preserved. Multiple live instances (a message pane plus
  several compose windows) share one darkened copy; per-instance sheets carry the
  root background fallback, ignore counter-rules, and icon invert rules. The walk
  is cached per rule text, refreshed by a `<head>` observer plus a cheap rule-count
  fingerprint polled once a second (for CSSOM-only edits).
- **Inline overrides.** Email HTML carries its colors in `style=` attributes and
  legacy presentational attributes (`bgcolor`, `color`, `fill`, `stroke`). Each
  affected element gets marker attributes plus `--dark-theme-inline-*` custom
  properties, driven by one static rule block — the author's style attribute text is
  never rewritten, so `revert()` restores it exactly. A MutationObserver keeps the
  pass current for added nodes and attribute changes.

Image handling: a dark, mostly-transparent `<img>` (a logo) is inverted after canvas
analysis; stylesheet `background-image` url layers are analyzed asynchronously and
replaced (dark transparent icons inverted, large light photos hidden, light solids
replaced with a darkened solid) via a patch sheet; gradients are darkened
synchronously. Cross-origin images can't be analyzed (CORS) — use `invertImageUrls`
for those.

Known limits, accepted for the Chromium + Gmail use case: cross-origin stylesheets
are skipped (same CORS wall as images); `@layer` is flattened; variable typing is
one hop deep; keyword colors inside compound values (`1px solid white`) aren't
darkened; adopted stylesheets, shadow DOM, and iframes aren't walked.

# @meru/dark-theme

Applies a dark theme to any DOM element and its subtree — colors, gradients, and
images — with good contrast, and without touching the rest of the document.

## Usage

```ts
import { applyDarkTheme } from "@meru/dark-theme";

const controller = applyDarkTheme(element);

// When the subtree is discarded, for example by removing it from the DOM:
controller.destroy();

// Or, to undo theming on a still-live subtree:
controller.revert();
```

The engine needs a DOM context, because it uses `getComputedStyle`, `<canvas>`,
and `Image`. Use it in a renderer or a content script rather than in the Electron
main process.

## Options

The `options` argument of `applyDarkTheme(root, options?)` is a partial `Theme`
plus the following engine options:

- `backgroundColor` / `textColor`: the HSL poles that light colors are remapped
  toward. Default `#181a1b` / `#e8e6e3`.
- `brightness` / `contrast` / `sepia` / `grayscale`: filter adjustments applied on
  top of the remap. Default `100` / `100` / `0` / `0`.
- `ignore?: Array<string | { selector: string; properties: string[] }>`: opts
  elements out of theming. A **string** selector keeps its matching elements and
  their descendants fully original, matched with `closest` — colored chips or
  badges, for example. An **object** skips only the listed `properties` on
  elements matching its `selector`, matched with `matches`, and leaves those
  properties to CSS. `{ selector: ".foo", properties: ["border-color"] }` lets a
  stylesheet set the border color, which the engine's inline override would
  otherwise win over, and `"border-color"` covers all four sides. The skip
  applies across every path the engine darkens a property from — the inline
  override, the `::before` and `::after` pseudo rules, and the darkened `:hover`
  and `:focus` state rules — so an ignored property stays with CSS in every
  state.
- `observe?: boolean`: watches the subtree and keeps theming content added later,
  and re-themes an element when its class changes, so that state-driven styles
  are darkened too — a shadow that a sticky toolbar gains on scroll, for example.
  Defaults to `true`. Call `revert()` or `destroy()` to disconnect.
- `css?: string`: CSS injected into the document while the theme is active and
  removed on `revert()` or `destroy()`. Use it for rules the inline-override
  engine can't reach, such as `:hover` and `:focus` backgrounds or `::before`
  icons, scoped with the `[data-dark-theme]` attribute so that they apply only
  where the engine has themed.
- `invertImageUrls?: string[]`: URL prefixes of dark monochrome icons to
  blank-invert with `filter: invert(1)`, covering an element's `background-image`
  and a pseudo-element's `content` or `background-image`. It's a pragmatic
  stand-in for pixel analysis when the icon is cross-origin, and therefore
  CORS-tainted and impossible to inspect — a site's material-icon CDN path, for
  example. Matched with `startsWith`.
- `invertImageExcludeFilenames?: string[]`: filenames, meaning the last path
  segment of the URL, that `invertImageUrls` skips even when their prefix
  matches. Use it for a colored icon variant that shares a path with the
  monochrome ones, which inverting would recolor wrongly.

## Controller

- `revert()`: disconnects the observer, restores every element's original inline
  styles, and releases references. Use it on a **still-live** subtree.
- `destroy()`: disconnects the observer and releases references **without**
  restoring styles. Use it when the subtree is being discarded, because restoring
  would be wasted work.

## Behavior notes

- Light-valued CSS custom properties declared or referenced in the document's
  **same-origin** stylesheets are darkened and re-declared scoped to
  `[data-dark-theme]`, so surfaces painted through `var(--token)` are covered even
  in states the element walk never observes. A variable inherits, so the dark
  value cascades into the themed subtree and stops at its boundary. Properties
  declared only in cross-origin stylesheets are missed, the same CORS limit that
  applies to images. A `css` override for the same property still wins, so
  hand-tune exceptions there.
- The `::before` and `::after` pseudo-elements are darkened too. Their
  non-inheriting paint — background, border, box-shadow, and gradient
  background-images — is remapped and emitted into an injected stylesheet keyed to
  the owning element. Their `color` isn't touched, because it inherits the
  element's own themed color. A pseudo content image can't be color-inspected
  when it's cross-origin, the same CORS limit that applies to `<img>`. If its URL
  matches `invertImageUrls` it's blank-inverted, and otherwise left alone. The
  invert decision is re-evaluated when the element's class or state changes, so an
  icon whose URL swaps on toggle, such as a star, gains or loses the invert to
  match.
- The `:hover`, `:focus`, and `:active` styles are read from the document's
  **same-origin** author rules, darkened, and re-emitted with each selector kept
  verbatim inside a CSS `@scope (root)` block, so that they apply only within the
  themed subtree. A computed-style snapshot can't see them, because the state
  isn't active at theme time. Rules declared only in cross-origin stylesheets are
  missed, the same CORS limit.
- Colors apply synchronously. Image analysis is asynchronous and resolves shortly
  after.
- Calling `applyDarkTheme` again themes only the elements not yet themed, so it's
  safe to call as the subtree grows.
- Overrides are inline `!important`. Use `ignore` for elements that must keep
  their own colors, because a stylesheet rule can't override an inline
  `!important`.
- Cross-origin images need CORS to be analyzed, and are otherwise left untouched.

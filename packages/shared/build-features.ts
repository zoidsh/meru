/**
 * Features that are compiled into some builds and left out of others, so that
 * what a channel doesn't offer isn't merely hidden but absent from the bundle.
 *
 * These are build constants rather than config keys on purpose. A config read
 * happens at runtime, so the code behind it ships either way and only its
 * effects are gated — which is the right shape when the answer can change under
 * a running app, as it is for the license gate on workspace apps. A channel
 * cannot change without installing a different artifact, so the question is
 * settled while the bundle is being written, and answering it there is what
 * lets the bundler drop the feature's modules entirely.
 *
 * `scripts/build.ts` defines `process.env.MERU_BUILD_CHANNEL` for every bundle
 * it writes, so each constant below folds to a literal and every branch on it
 * is either kept whole or removed with everything it reaches. Read them through
 * a plain `if` or a ternary; anything the bundler can't fold — a value passed
 * through a function, an object property — keeps the feature linked in.
 *
 * Adding an alpha-only feature is a constant here and a branch at its entry
 * points. Graduating one to stable is deleting both.
 */

/**
 * Whether this bundle is for the Experimental channel, which is `alpha` on the
 * wire — the same value `release.yml` passes electron-builder as
 * `--config.publish.channel`, though not the same mechanism: that flag is read
 * long after `bun run build:js` has written the bundles, so the channel reaches
 * the JavaScript build through the environment instead.
 */
export const IS_ALPHA_BUILD = process.env.MERU_BUILD_CHANNEL === "alpha";

/**
 * Chrome extension support, which ships to the Experimental channel only.
 *
 * It is Pro-gated, opt-in and labeled beta, but the loader, the `chrome.*`
 * facade and the CRX install pipeline still sat on paths every stable user
 * executes at launch. Until it has been proven on real machines beyond the one
 * it was built on, stable carries none of it.
 */
export const EXTENSIONS_ENABLED = IS_ALPHA_BUILD;

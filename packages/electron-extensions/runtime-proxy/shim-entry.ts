import { installShim } from "./install-shim";

/**
 * Entry point of the runtime proxy's shim. It is bundled on its own, like the
 * facade, and a content-script-only copy runs it in every context of the
 * extension that can message: the derive prepends it to every `content_scripts`
 * entry, so it reaches the isolated world before the extension's own scripts,
 * and writes it into every extension page — the action popup, and the frames an
 * extension embeds in web pages — ahead of the page's own.
 *
 * Prepending it to every entry means running it once per entry the page
 * matches, all in one isolated world, which is why the install itself is what
 * holds the "once per context" rather than this file.
 */
installShim();

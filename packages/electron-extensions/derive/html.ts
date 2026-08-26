import { allowConnectSource } from "./manifest";

const HEAD_TAG = /<head\b[^>]*>/i;

const HTML_TAG = /<html\b[^>]*>/i;

const META_CONTENT_SECURITY_POLICY_TAG =
  /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;

const CONTENT_ATTRIBUTE = /(\bcontent\s*=\s*)(["'])([\s\S]*?)\2/i;

/**
 * Puts the loader's scripts in front of every script an extension page runs, in
 * the order given. Extension pages get the same incomplete `chrome` object the
 * service worker does, and a page has no preload of its own that reliably
 * reaches its main world, so the script tags are written into the page when the
 * extension is derived.
 */
export function injectPageScripts(html: string, scriptUrls: string[]) {
  const missingScriptUrls = scriptUrls.filter((scriptUrl) => !html.includes(scriptUrl));

  if (missingScriptUrls.length === 0) {
    return html;
  }

  const scriptTags = missingScriptUrls
    .map((scriptUrl) => `<script src="${scriptUrl}"></script>`)
    .join("");

  const openingTag = HEAD_TAG.exec(html) ?? HTML_TAG.exec(html);

  if (!openingTag) {
    return `${scriptTags}${html}`;
  }

  const insertAt = openingTag.index + openingTag[0].length;

  return `${html.slice(0, insertAt)}${scriptTags}${html.slice(insertAt)}`;
}

function decodeAttribute(value: string) {
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function encodeAttribute(value: string, quote: string) {
  const encoded = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return quote === '"' ? encoded.replace(/"/g, "&quot;") : encoded.replace(/'/g, "&#39;");
}

/**
 * Widens the `connect-src` of a page's own `<meta>` content security policy,
 * the way `allowConnectSource` widens the manifest's.
 *
 * Both policies govern an extension page and the stricter one decides, so a
 * page declaring `default-src 'none'` — which is what 1Password's popup and
 * each of its inline frames declare — refuses the bridge however wide the
 * manifest was made. Measured on Electron 43: the fetch fails with "Refused to
 * connect because it violates the document's Content Security Policy" before
 * any handler is asked.
 */
export function allowPageConnectSource(html: string, source: string) {
  return html.replace(META_CONTENT_SECURITY_POLICY_TAG, (metaTag) =>
    metaTag.replace(
      CONTENT_ATTRIBUTE,
      (_attribute, assignment: string, quote: string, policy: string) =>
        `${assignment}${quote}${encodeAttribute(
          allowConnectSource(decodeAttribute(policy), source),
          quote,
        )}${quote}`,
    ),
  );
}

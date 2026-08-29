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

/**
 * Every character reference in one pass, so nothing is decoded twice — a
 * sequence of replacements ending at `&amp;` turns a literal `&amp;#x27;` into
 * an apostrophe, which is not what the page said.
 */
const CHARACTER_REFERENCE_SOURCE = "&(?:#[Xx]([0-9A-Fa-f]+)|#([0-9]+)|([A-Za-z][A-Za-z0-9]*));";

const CHARACTER_REFERENCES = new RegExp(CHARACTER_REFERENCE_SOURCE, "g");

const ANY_CHARACTER_REFERENCE = new RegExp(CHARACTER_REFERENCE_SOURCE);

/** The five with names; a policy has no use for any of the others. */
const NAMED_CHARACTER_REFERENCES: Record<string, string | undefined> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeCharacterReference(reference: string, hex: string, decimal: string, name: string) {
  if (name !== undefined) {
    return NAMED_CHARACTER_REFERENCES[name.toLowerCase()] ?? reference;
  }

  const codePoint = Number.parseInt(hex ?? decimal, hex !== undefined ? 16 : 10);

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    // Not a code point at all, so it is not a reference either
    return reference;
  }
}

function decodeAttribute(value: string) {
  return value.replace(CHARACTER_REFERENCES, decodeCharacterReference);
}

/**
 * Whether every reference in the value is one this understands. What is asked
 * is of the decoded value: anything still shaped like a reference after
 * decoding is one that was not decoded — a name outside the five, or a number
 * that is no code point — and re-encoding would write its `&` back as `&amp;`
 * and corrupt it. Such an attribute is left exactly as the extension wrote it.
 * The page then keeps a policy the shim cannot reach the bridge through, which
 * is the safe direction to fail in.
 *
 * A decoded `&` on its own is not that. `&amp;` in a URL source decodes to `&`
 * and is written back as `&amp;`, which is the round trip working.
 */
function hasOnlyKnownCharacterReferences(value: string) {
  return !ANY_CHARACTER_REFERENCE.test(decodeAttribute(value));
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
      (attribute, assignment: string, quote: string, policy: string) => {
        if (!hasOnlyKnownCharacterReferences(policy)) {
          return attribute;
        }

        return `${assignment}${quote}${encodeAttribute(
          allowConnectSource(decodeAttribute(policy), source),
          quote,
        )}${quote}`;
      },
    ),
  );
}

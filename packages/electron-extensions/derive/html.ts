const HEAD_TAG = /<head\b[^>]*>/i;

const HTML_TAG = /<html\b[^>]*>/i;

/**
 * Puts the facade in front of every script an extension page runs. Extension
 * pages get the same incomplete `chrome` object the service worker does, and a
 * page has no preload of its own that reliably reaches its main world, so the
 * script tag is written into the page when the extension is derived.
 */
export function injectFacadeScript(html: string, facadeUrl: string) {
  if (html.includes(facadeUrl)) {
    return html;
  }

  const scriptTag = `<script src="${facadeUrl}"></script>`;

  const openingTag = HEAD_TAG.exec(html) ?? HTML_TAG.exec(html);

  if (!openingTag) {
    return `${scriptTag}${html}`;
  }

  const insertAt = openingTag.index + openingTag[0].length;

  return `${html.slice(0, insertAt)}${scriptTag}${html.slice(insertAt)}`;
}

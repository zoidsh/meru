/** The placeholder every email address becomes. */
export const EMAIL_PLACEHOLDER = "person@example.com";

/** The placeholder every person's name becomes. */
export const NAME_PLACEHOLDER = "Sender";

/** The placeholder every subject becomes, in the list, in a thread and in the document's title. */
export const SUBJECT_PLACEHOLDER = "Subject";

/** The placeholder every message snippet becomes. */
export const SNIPPET_PLACEHOLDER = "Snippet";

/** What a URL's query string becomes, so the shape of the address survives without its tokens. */
export const QUERY_PLACEHOLDER = "?[scrubbed]";

/** What an inline `data:` URL becomes: the shortest address of the same scheme. */
export const DATA_URL_PLACEHOLDER = "data:,";

const ID_ATTRIBUTES = new Set([
  "data-legacy-last-message-id",
  "data-legacy-last-non-draft-message-id",
  "data-legacy-message-id",
  "data-legacy-thread-id",
  "data-message-id",
  "data-thread-id",
]);

// Gmail writes a sender's name on the element that carries the address, and a hovercard's name beside its id; a form field's name, such as compose's `to` and `subjectbox`, is markup a fixture is selected by.
const NAME_WITH = ["email", "data-hovercard-id"];

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const TAG =
  /<(?<closing>\/?)(?<name>[a-z][\w-]*)(?<attrs>(?:"[^"]*"|'[^']*'|[^>"'])*)>/giu;
const ATTRIBUTE =
  /(?<name>[A-Za-z_:][\w:.-]*)=(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/gu;
const SCRIPT_BODY =
  /(?<open><script\b(?:"[^"]*"|'[^']*'|[^>"'])*>)[\s\S]*?(?<close><\/script\s*>)/giu;
const EMAIL = /[\w.+-]+@[a-z\d-]+(?:\.[a-z\d-]+)*\.[a-z]{2,}/giu;
const QUERY =
  /(?<address>(?:[a-z][\w+.-]*:\/\/|\/)[^\s?#"'<>]*)\?[^\s#"'<>]*/giu;
// Gmail's session token and inbox key, which a link carries outside a query string as well.
const TOKEN = /\b(?<key>at|ik)=[\w%.~+/-]+/gu;
const DATA_URL = /\bdata:[a-z][\w.+-]*\/[^\s"')>]*/giu;
// A Gmail address names the open thread after its view, such as #inbox/FMfcgz… or #label/Work/FMfcgz…
const HASH_ID =
  /(?<prefix>#[A-Za-z\d%._-]+(?:\/[A-Za-z\d%._-]+)*\/)(?<id>[A-Za-z\d]{15,})/gu;

interface Tag {
  readonly attrs: string;
  readonly closing: boolean;
  /** An element with no content of its own, whose close tag is never looked for. */
  readonly empty: boolean;
  /** Where the tag ends in the document, past its `>`. */
  readonly end: number;
  readonly name: string;
  readonly raw: string;
  readonly start: number;
}

/** Every tag of the document in order, as positions into it. */
export const tagsOf = (html: string): readonly Tag[] => {
  const found: Tag[] = [];
  for (const match of html.matchAll(TAG)) {
    const raw = match.groups?.name;
    const attrs = match.groups?.attrs;
    if (raw === undefined || attrs === undefined) {
      continue;
    }
    const name = raw.toLowerCase();
    const start = match.index;
    found.push({
      attrs,
      closing: match.groups?.closing === "/",
      empty: VOID_ELEMENTS.has(name) || attrs.trimEnd().endsWith("/"),
      end: start + match[0].length,
      name,
      raw,
      start,
    });
  }
  return found;
};

const attributesOf = (attrs: string): ReadonlyMap<string, string> => {
  const found = new Map<string, string>();
  for (const match of attrs.matchAll(ATTRIBUTE)) {
    const name = match.groups?.name?.toLowerCase();
    const value = match.groups?.double ?? match.groups?.single;
    if (name !== undefined && value !== undefined) {
      found.set(name, value);
    }
  }
  return found;
};

/** A placeholder per original value, the same one each time it is seen, numbered per kind. */
const makeIds = () => {
  const seen = new Map<string, string>();
  const counts = new Map<string, number>();
  return (value: string, kind: string): string => {
    if (value === "") {
      return value;
    }
    const known = seen.get(value);
    if (known !== undefined) {
      return known;
    }
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    const made = `${kind}-${next}`;
    seen.set(value, made);
    return made;
  };
};

type Ids = ReturnType<typeof makeIds>;

/** Replaces each match with what `replacer` answers for it, which a replacement string cannot express. */
const replaceEach = (
  text: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => string
): string => {
  let out = "";
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    out += text.slice(cursor, match.index) + replacer(match);
    cursor = match.index + match[0].length;
  }
  return out + text.slice(cursor);
};

/** The contents of every `<script>` dropped, its tags kept: Gmail inlines its session state, keys and tokens there. */
export const dropScriptBodies = (html: string): string =>
  html.replaceAll(SCRIPT_BODY, "$<open>$<close>");

/** Every query string, session token and inline `data:` URL replaced, the address around them kept. */
export const scrubUrls = (text: string): string =>
  text
    .replaceAll(QUERY, `$<address>${QUERY_PLACEHOLDER}`)
    .replaceAll(TOKEN, "$<key>=[scrubbed]")
    .replaceAll(DATA_URL, DATA_URL_PLACEHOLDER);

/** Every email address replaced, wherever it sits: text, a `mailto:` link, a hovercard's id, a title or a label. */
export const scrubEmails = (text: string): string =>
  text.replaceAll(EMAIL, EMAIL_PLACEHOLDER);

const scrubValue = (
  name: string,
  value: string,
  named: boolean,
  ids: Ids
): string => {
  if (name === "nonce") {
    return "";
  }
  if (ID_ATTRIBUTES.has(name)) {
    return ids(value, name.includes("message") ? "message" : "thread");
  }
  if (name === "name" && named) {
    return NAME_PLACEHOLDER;
  }
  return scrubEmails(scrubUrls(value));
};

const scrubAttributes = (attrs: string, ids: Ids): string => {
  const attributes = attributesOf(attrs);
  const named = NAME_WITH.some((key) => attributes.has(key));
  return replaceEach(attrs, ATTRIBUTE, (match) => {
    const name = match.groups?.name;
    const double = match.groups?.double;
    const value = double ?? match.groups?.single;
    if (name === undefined || value === undefined) {
      return match[0];
    }
    const quote = double === undefined ? "'" : '"';
    const scrubbed = scrubValue(name.toLowerCase(), value, named, ids);
    return `${name}=${quote}${scrubbed}${quote}`;
  });
};

const rewriteTags = (html: string, ids: Ids): string => {
  let out = "";
  let cursor = 0;
  for (const tag of tagsOf(html)) {
    if (tag.closing) {
      continue;
    }
    out += html.slice(cursor, tag.start);
    out += `<${tag.raw}${scrubAttributes(tag.attrs, ids)}>`;
    cursor = tag.end;
  }
  return out + html.slice(cursor);
};

/** The placeholder the element's text becomes, or null for an element whose text is kept. */
const textPlaceholder = (
  name: string,
  attributes: ReadonlyMap<string, string>
): string | null => {
  if (name === "title") {
    return SUBJECT_PLACEHOLDER;
  }
  if (attributes.has("email")) {
    return NAME_PLACEHOLDER;
  }
  if (name === "h2" && attributes.has("data-legacy-thread-id")) {
    return SUBJECT_PLACEHOLDER;
  }
  const classes = (attributes.get("class") ?? "").split(/\s+/u);
  // Gmail's list draws a subject as bog or bqe and the snippet after it as y2.
  if (classes.includes("bog") || classes.includes("bqe")) {
    return SUBJECT_PLACEHOLDER;
  }
  if (classes.includes("y2")) {
    return SNIPPET_PLACEHOLDER;
  }
  return null;
};

/** The index of the tag that closes the element opened at `opened`, or undefined when nothing does. */
const closeOf = (tags: readonly Tag[], opened: number): number | undefined => {
  const open = tags[opened];
  if (open === undefined) {
    return undefined;
  }
  let depth = 1;
  for (let index = opened + 1; index < tags.length; index += 1) {
    const tag = tags[index];
    if (tag === undefined || tag.name !== open.name) {
      continue;
    }
    if (tag.closing) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    } else if (!tag.empty) {
      depth += 1;
    }
  }
  return undefined;
};

/** The element's content with its first text taken by `placeholder` and the rest dropped, every tag within it kept. */
const replaceTexts = (
  html: string,
  tags: readonly Tag[],
  opened: number,
  closed: number,
  placeholder: string
): string => {
  const open = tags[opened];
  const close = tags[closed];
  if (open === undefined || close === undefined) {
    return "";
  }
  let out = "";
  let cursor = open.end;
  let taken = false;
  const text = (slice: string) => {
    if (slice.trim() === "") {
      return slice;
    }
    if (taken) {
      return "";
    }
    taken = true;
    return placeholder;
  };
  for (let index = opened + 1; index < closed; index += 1) {
    const tag = tags[index];
    if (tag === undefined) {
      continue;
    }
    out += text(html.slice(cursor, tag.start)) + html.slice(tag.start, tag.end);
    cursor = tag.end;
  }
  return out + text(html.slice(cursor, close.start));
};

const scrubTexts = (html: string): string => {
  const tags = tagsOf(html);
  let out = "";
  let cursor = 0;
  for (const [opened, tag] of tags.entries()) {
    if (tag.closing || tag.empty || tag.end < cursor) {
      continue;
    }
    const placeholder = textPlaceholder(tag.name, attributesOf(tag.attrs));
    if (placeholder === null) {
      continue;
    }
    const closed = closeOf(tags, opened);
    const close = closed === undefined ? undefined : tags[closed];
    if (closed === undefined || close === undefined) {
      continue;
    }
    out += html.slice(cursor, tag.end);
    out += replaceTexts(html, tags, opened, closed, placeholder);
    cursor = close.start;
  }
  return out + html.slice(cursor);
};

/**
 * The captured document with everything personal taken out, so it can be checked into a public
 * repository as a fixture: addresses, names, subjects, snippets, thread and message ids, script
 * bodies, query strings, inline data and nonces. An id becomes a placeholder by value, the same one
 * each time, so structure that relies on two ids being equal survives; the numbering starts afresh
 * on every call.
 */
export const scrubHtml = (html: string): string => {
  const ids = makeIds();
  const structure = scrubTexts(rewriteTags(dropScriptBodies(html), ids));
  const hashed = replaceEach(structure, HASH_ID, (match) => {
    const prefix = match.groups?.prefix;
    const id = match.groups?.id;
    return prefix === undefined || id === undefined
      ? match[0]
      : `${prefix}${ids(id, "thread")}`;
  });
  return scrubEmails(scrubUrls(hashed));
};

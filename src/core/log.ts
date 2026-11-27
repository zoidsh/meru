import { APP_IDS, APPS } from "./apps.ts";
import { MERU_PRO_URL } from "./entitlement.ts";
import { KEEP_ALIVE_URL } from "./keep-alive.ts";
import { RELEASES_API_URL } from "./releases.ts";
import { isTab } from "./state.ts";
import type { TabEntry } from "./state.ts";
import type { TabKey } from "./tabs.ts";
import { RELEASES_URL } from "./updates.ts";
import { SIGN_IN_ORIGINS } from "./window-open.ts";

/**
 * What the log knows at the moment a line is written, so a profile is named
 * by its place in the row it then has and Meru's own folders by name.
 */
export interface LogContext {
  /** Meru's user data folder, written as `<data>`. */
  dataDir?: string;
  /** Where the app's own code is, written as `<app>`, so a stack keeps it. */
  appDir?: string;
  profiles: () => readonly { id: string; tabs: readonly TabEntry[] }[];
}

declare const scrubbedBrand: unique symbol;

/**
 * A value one of the scrubbers below made, the only kind of text a field may
 * hold besides a string literal type. Nothing outside this module can make
 * one without a cast.
 */
export interface Scrubbed {
  readonly [scrubbedBrand]: true;
}

interface Renderable {
  render: (context: LogContext) => string;
}

const scrubbed = (render: Renderable["render"]) =>
  ({ render }) as Renderable as unknown as Scrubbed;

const renderScrubbed = (value: Scrubbed, context: LogContext) =>
  (value as unknown as Renderable).render(context);

const isScrubbed = (value: unknown): value is Scrubbed =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Partial<Renderable>).render === "function";

/**
 * A string literal type, or a union of them, and never `string` or a
 * template with a placeholder in it, whose `Record` has an index signature.
 */
export type Fixed<S> = S extends string
  ? string extends S
    ? never
    : Record<never, never> extends Record<S, 1>
      ? never
      : S
  : never;

export type FieldValue = Scrubbed | number | boolean | Error | undefined;

/**
 * Each field a value of a known kind, or a string fixed in the source; never
 * `any`, which would pass for either.
 */
export type Checked<F> = {
  [K in keyof F]: 0 extends 1 & F[K]
    ? never
    : F[K] extends FieldValue
      ? F[K]
      : Fixed<Exclude<F[K], undefined>> | Extract<F[K], undefined>;
};

/** A fixed name of lowercase words joined by dashes: `tab-load-failed`. */
export type EventName<N> = [Fixed<N>] extends [never]
  ? never
  : N extends `${string} ${string}`
    ? never
    : N extends Lowercase<N & string>
      ? N
      : never;

/**
 * Writes one event: its fixed name, then its fields. A string that is not
 * fixed in the source does not type-check, so whatever the run produces goes
 * through a scrubber first.
 */
export type Log = <
  const N extends string,
  const F extends Record<string, unknown> = Record<never, never>,
>(
  name: EventName<N>,
  fields?: Checked<F>
) => void;

/** One event as a logger is handed it, before it is formatted. */
export interface LogEvent {
  name: string;
  fields: Readonly<Record<string, unknown>>;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const hostOf = (url: string) =>
  URL.canParse(url) ? new URL(url).hostname : undefined;

const KNOWN_HOSTS: ReadonlySet<string> = new Set(
  [
    ...APPS.flatMap((app) => app.claims.map((claim) => claim.origin)),
    ...SIGN_IN_ORIGINS,
    KEEP_ALIVE_URL,
    MERU_PRO_URL,
    RELEASES_URL,
    RELEASES_API_URL,
  ]
    .map(hostOf)
    .filter((host) => host !== undefined)
);

/**
 * Whether a host may be written as it is: one of the pages Meru opens or the
 * servers it asks, or this machine. Any other names a site the person
 * visited.
 */
export const isKnownHost = (hostname: string) =>
  KNOWN_HOSTS.has(hostname.toLowerCase()) || LOOPBACK.has(hostname);

const OTHER_SITE = "another site";

/** A URL as its host alone, or what kind of URL it is. */
const urlText = (url: string) => {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return "a URL";
  }

  if (/^(?:https?|wss?):$/u.test(parsed.protocol)) {
    return isKnownHost(parsed.hostname) ? parsed.hostname : OTHER_SITE;
  }

  return /^[a-z][a-z0-9+.-]{0,20}:$/u.test(parsed.protocol)
    ? parsed.protocol
    : "a URL";
};

/** A URL's host alone (`mail.google.com`), or "another site". */
const hostField = (url: string | URL | undefined) =>
  scrubbed(() => (url === undefined ? "none" : urlText(String(url))));

const placeOf = (context: LogContext, profileId: string) => {
  const index = context.profiles().findIndex((one) => one.id === profileId);

  return index === -1 ? undefined : index + 1;
};

const profileText = (context: LogContext, profileId: string) => {
  const place = placeOf(context, profileId);

  return place === undefined ? "a removed profile" : `profile ${place}`;
};

/** A profile by its place in the row: "profile 2". */
const profileField = (profileId: string) =>
  scrubbed((context) => profileText(context, profileId));

const KNOWN_APPS: ReadonlySet<string> = new Set(APP_IDS);

const tabText = (context: LogContext, { profileId, tabId }: TabKey) => {
  const owner = context.profiles().find((one) => one.id === profileId);
  const tabs = owner?.tabs.filter(isTab) ?? [];
  const index = tabs.findIndex((one) => one.id === tabId);
  const app = tabs[index]?.app;
  const kind = app !== undefined && KNOWN_APPS.has(app) ? ` ${app}` : "";

  return index === -1
    ? `${profileText(context, profileId)} a closed tab`
    : `${profileText(context, profileId)} tab ${index + 1}${kind}`;
};

/**
 * A tab by its profile's place and its own, with its app: "profile 1 tab 2
 * calendar". `key` may be `tabKey`'s `profile/tab`.
 */
const tabField = (key: TabKey | string) => {
  const parsed =
    typeof key === "string"
      ? {
          profileId: key.slice(0, Math.max(0, key.indexOf("/"))),
          tabId: key.slice(key.indexOf("/") + 1),
        }
      : key;

  return scrubbed((context) => tabText(context, parsed));
};

/**
 * A file in Meru's own folders, as a store's. The net writes it as every path:
 * under `<data>` or `<app>` as it is, anywhere else as "a path".
 */
const pathField = (file: string) => scrubbed(() => file);

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/u;

const codeText = (value: unknown): string => {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }

  if (typeof value === "string") {
    return CODE.test(value) ? value : "other";
  }

  return value instanceof Error && "code" in value
    ? codeText(value.code)
    : "other";
};

/**
 * An error code as Chromium or Node names it (`ERR_NAME_NOT_RESOLVED`,
 * `ENOENT`, -105), or an error's own `code` alone, never its message; any
 * other value is written as "other". For a failure whose message would hold
 * a URL or a path the person chose.
 */
const codeField = (value: unknown) => scrubbed(() => codeText(value));

/**
 * A word from a set the code knows, as a language tag, a menu item's or
 * command's id, an app's id, an outcome or a version. Never text a person
 * typed or a page or file supplied, which the pattern alone cannot tell from
 * one of these.
 */
const tokenField = (value: string | undefined) =>
  scrubbed(() =>
    value !== undefined && /^[\w.:@+-]{1,64}$/u.test(value) ? value : "other"
  );

/** Top-level domains besides the two-letter ones, as a host ends with. */
const TLDS: ReadonlySet<string> = new Set([
  "com",
  "net",
  "org",
  "info",
  "biz",
  "edu",
  "gov",
  "mil",
  "int",
  "arpa",
  "app",
  "dev",
  "page",
  "google",
  "xyz",
  "online",
  "site",
  "website",
  "shop",
  "store",
  "tech",
  "cloud",
  "blog",
  "news",
  "live",
  "pro",
  "name",
  "mobi",
  "asia",
  "club",
  "top",
  "icu",
  "vip",
  "work",
  "space",
  "fun",
  "life",
  "world",
  "today",
  "email",
  "mail",
  "media",
  "digital",
  "network",
  "group",
  "agency",
  "company",
  "studio",
  "design",
  "services",
  "systems",
  "example",
  "test",
  "invalid",
  "local",
  "localhost",
  "internal",
  "onion",
  "lan",
  "home",
]);

/** Two letters a file ends with that no country's domain is. */
const NOT_TLDS: ReadonlySet<string> = new Set([
  "js",
  "ts",
  "md",
  "py",
  "gz",
  "xz",
  "rs",
]);

const isTld = (label: string) => {
  const lower = label.toLowerCase();

  return lower.length === 2 ? !NOT_TLDS.has(lower) : TLDS.has(lower);
};

// A host with no scheme, as Node's `getaddrinfo ENOTFOUND bank.example` gives
// one, with any path or query after it. Only one that ends in a domain, so a
// dotted id of Meru's own (`inbox.toggle`, `view.reload`,
// `com.apple.quarantine`) or a file (`2025.pdf`) stays readable.
const BARE_HOST =
  /(?<![\p{L}\p{N}_.~/\\@<>:-])(?<host>(?:[\p{L}\p{N}-]+\.)+(?<tld>\p{L}{2,63}))(?![\p{L}\p{N}_-])(?<rest>[/?#][^\s"'<>`]*)?/giu;

const bareHost = (
  match: string,
  host: string,
  tld: string,
  rest: string | undefined
) => {
  if (!isTld(tld)) {
    return match;
  }

  return isKnownHost(host) && rest === undefined ? host : OTHER_SITE;
};

const errorText = (error: unknown) => {
  if (!(error instanceof Error)) {
    return typeof error === "string" ? error : "a value that is no error";
  }

  const errorCode = "code" in error ? error.code : undefined;
  const name = error.name === "Error" ? "" : `${error.name}: `;
  const suffix =
    typeof errorCode === "string" || typeof errorCode === "number"
      ? ` (${errorCode})`
      : "";

  return `${name}${error.message}${suffix}`;
};

const describeError = (error: unknown, context: FolderContext) =>
  scrubText(errorText(error), context).replaceAll(BARE_HOST, bareHost);

/**
 * Whatever a `catch` caught, as its name, message and code, through the net
 * and with any host scrubbed. A string is taken as a message Meru wrote, as a
 * mail check's reason; never pass one a page, a file or a person supplied.
 */
const failureField = (error: unknown) =>
  scrubbed((context) => describeError(error, context));

const STACK_FRAMES = 8;

/** As `failure`, with the first frames of its stack. */
const stackField = (error: unknown) =>
  scrubbed((context) => {
    const frames =
      error instanceof Error && error.stack !== undefined
        ? error.stack
            .split("\n")
            .slice(1, STACK_FRAMES + 1)
            .map((frame) => frame.trim())
        : [];

    return [
      describeError(error, context),
      ...frames.map((frame) => scrubText(frame, context)),
    ].join(" | ");
  });

type FolderContext = Pick<LogContext, "dataDir" | "appDir">;

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

const ADDRESS =
  /(?:"[^"\n]{1,64}"|[\p{L}\p{N}._%+-]+)@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;

// Where an absolute path starts: a POSIX one of two folders or more, a
// Windows drive or a UNC share.
const ABSOLUTE = String.raw`(?:[A-Za-z]:[\\/]|\\\\|/[^/\s"'<>|]+/)`;

const SCRUBS: readonly [RegExp, string | ((match: string) => string)][] = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`]*/giu, urlText],
  [
    /\b(?:mailto|tel|sms|data|blob|javascript):[^\s"'<>`]*/giu,
    (match) => `${match.slice(0, match.indexOf(":")).toLowerCase()}:`,
  ],
  [ADDRESS, "an address"],
  // A quoted path may hold spaces, up to its closing quote.
  [new RegExp(String.raw`(['"])${ABSOLUTE}[^'"\n]*\1`, "gu"), "$1a path$1"],
  [
    new RegExp(String.raw`(?<![\w.:/\\>~-])${ABSOLUTE}[^\s"'<>|]*`, "gu"),
    "a path",
  ],
  // Shaped as a license key or a token: groups of four or more joined by
  // dashes, holding a digit.
  [/\b(?=[a-z0-9-]*\d)[a-z0-9]{4,}(?:-[a-z0-9]{4,}){2,}\b/giu, "a key"],
];

/**
 * The net under every field, for what reached it some other way, as an
 * error's message: Meru's own folders by name, then a URL, an address, any
 * other absolute path and a key.
 */
export const scrubText = (text: string, { dataDir, appDir }: FolderContext) => {
  let scrubbedText = text;

  for (const [folder, name] of [
    [appDir, "<app>"],
    [dataDir, "<data>"],
  ] as const) {
    if (folder !== undefined && folder.length > 1) {
      for (const form of new Set([folder, folder.replaceAll("\\", "/")])) {
        scrubbedText = scrubbedText.replaceAll(
          new RegExp(`${escapeRegExp(form)}(?=$|[\\\\/\\s"':])`, "giu"),
          name
        );
      }
    }
  }

  for (const [pattern, replace] of SCRUBS) {
    scrubbedText =
      typeof replace === "string"
        ? scrubbedText.replaceAll(pattern, replace)
        : scrubbedText.replaceAll(pattern, replace);
  }

  return scrubbedText;
};

const FIELD_LENGTH = 2000;

const valueText = (value: unknown, context: LogContext) => {
  if (isScrubbed(value)) {
    return renderScrubbed(value, context);
  }

  if (value instanceof Error) {
    return describeError(value, context);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // A literal fixed in the source, as the type allows; anything else a cast
  // let through is not written.
  return typeof value === "string" && /^[\w.:/+-]{0,64}$/u.test(value)
    ? value
    : "?";
};

const quoted = (text: string) =>
  /^[^\s"=]+$/u.test(text) ? text : JSON.stringify(text);

/** A field's text: on one line, through the net, then cut and quoted. */
const fieldText = (text: string, context: FolderContext) =>
  quoted(
    scrubText(text.replaceAll(/\s+/gu, " "), context).slice(0, FIELD_LENGTH)
  );

/**
 * One line of the log: the time, the event's name and its fields, each
 * `key=value`, on one line however many the values held. Each value is
 * scrubbed whole before it is cut or quoted, so neither hides what the net
 * looks for.
 */
export const formatLine = (
  time: Date,
  { name, fields }: LogEvent,
  context: LogContext
) => {
  // A cast can get any string past the type; a name is lowercase words
  // joined by dashes.
  const parts = [
    time.toISOString(),
    /^[a-z][a-z0-9-]{0,63}$/u.test(name) ? name : "unnamed-event",
  ];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      const field = /^[A-Za-z][\w-]{0,31}$/u.test(key) ? key : "field";

      parts.push(`${field}=${fieldText(valueText(value, context), context)}`);
    }
  }

  return parts.join(" ");
};

/** What the first line of each run says of it. */
export interface RunInfo {
  productName: string;
  version: string;
  /** `prod`, `dev` or `e2e`. */
  build: string;
  os: string;
  osVersion: string;
  arch: string;
  electron: string;
}

/** The line each run starts with, so support knows what wrote the rest. */
export const formatRunLine = (
  time: Date,
  info: RunInfo,
  context: FolderContext
) =>
  [
    time.toISOString(),
    "run-started",
    `app=${fieldText(`${info.productName} ${info.version}`, context)}`,
    `build=${fieldText(info.build, context)}`,
    `os=${fieldText(`${info.os} ${info.osVersion}`, context)}`,
    `arch=${fieldText(info.arch, context)}`,
    `electron=${fieldText(info.electron, context)}`,
  ].join(" ");

/**
 * The scrubbers, the only way a value of the run reaches a field:
 * `log("tab-load-failed", { tab: scrub.tab(key), error: scrub.error(error) })`.
 */
export const scrub = {
  host: hostField,
  profile: profileField,
  tab: tabField,
  path: pathField,
  code: codeField,
  token: tokenField,
  error: failureField,
  stack: stackField,
};

const NEWLINE = 0x0a;

/**
 * The log once it has passed `cap` bytes: its newer half, from the first
 * whole line, so the oldest lines go first.
 */
export const keepNewerHalf = (text: string, cap: number) => {
  const bytes = new TextEncoder().encode(text);

  if (bytes.length <= cap) {
    return text;
  }

  const kept = bytes.subarray(bytes.length - Math.floor(cap / 2));
  const start = kept.indexOf(NEWLINE);

  return start === -1 ? "" : new TextDecoder().decode(kept.subarray(start + 1));
};

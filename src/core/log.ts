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
 * by its place in the row it then has and a path under the home folder
 * starts with `~`.
 */
export interface LogContext {
  home: string | undefined;
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

/** Each field a value of a known kind, or a string fixed in the source. */
export type Checked<F> = {
  [K in keyof F]: F[K] extends FieldValue
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
 * A path of Meru's own, as a store's file; the home folder written as `~`.
 * Never a download's or a folder the person chose.
 */
const pathField = (file: string) => scrubbed(() => file);

/**
 * An error code as Chromium or Node names it (`ERR_NAME_NOT_RESOLVED`,
 * `ENOENT`); anything else shaped otherwise is not written.
 */
const codeField = (value: string | number | undefined) =>
  scrubbed(() =>
    typeof value === "number" || /^[A-Z][A-Z0-9_]{1,63}$/u.test(value ?? "")
      ? String(value)
      : "other"
  );

/**
 * A word Meru, Chromium or a server made, as a language tag, a command's id
 * or a version; never one a person typed, which may be as short.
 */
const tokenField = (value: string | undefined) =>
  scrubbed(() =>
    value !== undefined && /^[\w.:@+-]{1,64}$/u.test(value) ? value : "other"
  );

/** What Meru's own files and its stacks end with, which no host does. */
const FILE_ENDINGS =
  "json|log|txt|js|cjs|mjs|ts|tsx|html|css|map|node|asar|app|exe|dll|so|dylib|plist|png|ico|icns|svg|wasm";

// A bare host, as Node's `getaddrinfo ENOTFOUND bank.example` gives one;
// only in an error's text, since Meru's own ids are dotted words too.
const BARE_HOST = new RegExp(
  String.raw`(?<![\w.~/\\@-])(?:[a-z0-9-]+\.)+(?!(?:${FILE_ENDINGS})\b)[a-z]{2,}\b(?![\w/\\-])`,
  "gu"
);

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

const describeError = (error: unknown) =>
  errorText(error).replaceAll(BARE_HOST, (match) =>
    isKnownHost(match) ? match : OTHER_SITE
  );

/** Whatever a `catch` caught, as its name, message and code. */
const failureField = (error: unknown) => scrubbed(() => describeError(error));

const STACK_FRAMES = 8;

/** As `failure`, with the first frames of its stack. */
const stackField = (error: unknown) =>
  scrubbed(() => {
    const frames =
      error instanceof Error && error.stack !== undefined
        ? error.stack
            .split("\n")
            .slice(1, STACK_FRAMES + 1)
            .map((frame) => frame.trim())
        : [];

    return [describeError(error), ...frames].join(" | ");
  });

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

const SCRUBS: readonly [RegExp, (match: string) => string][] = [
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()[\]{}`,]*/giu, urlText],
  [
    /\b(?:mailto|tel|sms|data|blob|javascript):[^\s"'<>]*/giu,
    (match) => `${match.slice(0, match.indexOf(":")).toLowerCase()}:`,
  ],
  [/[\w.%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/giu, () => "an address"],
  [/(?:\/Users|\/home)\/[^/\s"':]+/gu, () => "~"],
  [/\b[a-z]:\\Users\\[^\\\s"':]+/giu, () => "~"],
  // What is under the home folder but outside Meru's own folders, as a
  // download's, up to the quote or bracket around it.
  [/~[/\\][^'"|()]*/gu, (match) => `~${match.charAt(1)}…`],
  // Shaped as a license key or a token: groups of four or more joined by
  // dashes, holding a digit.
  [/\b(?=[a-z0-9-]*\d)[a-z0-9]{4,}(?:-[a-z0-9]{4,}){2,}\b/giu, () => "a key"],
];

/**
 * The net under every line, for what reached it some other way, as an error's
 * message: an address, a URL with a path, a key, a host outside Meru's pages
 * and the home folder.
 */
export const scrubText = (
  text: string,
  { home, dataDir, appDir }: Pick<LogContext, "home" | "dataDir" | "appDir">
) => {
  let scrubbedText = text;

  for (const [folder, name] of [
    [appDir, "<app>"],
    [dataDir, "<data>"],
    [home, "~"],
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
    scrubbedText = scrubbedText.replaceAll(pattern, replace);
  }

  return scrubbedText;
};

const FIELD_LENGTH = 2000;

const valueText = (value: unknown, context: LogContext) => {
  if (isScrubbed(value)) {
    return renderScrubbed(value, context);
  }

  if (value instanceof Error) {
    return describeError(value);
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

/**
 * One line of the log: the time, the event's name and its fields, each
 * `key=value`, on one line however many the values held, and scrubbed.
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
      const text = valueText(value, context)
        .replaceAll(/\s+/gu, " ")
        .slice(0, FIELD_LENGTH);

      parts.push(`${key}=${quoted(text)}`);
    }
  }

  return scrubText(parts.join(" "), context);
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
  context: Pick<LogContext, "home" | "dataDir" | "appDir">
) =>
  scrubText(
    [
      time.toISOString(),
      "run-started",
      `app=${quoted(`${info.productName} ${info.version}`)}`,
      `build=${quoted(info.build)}`,
      `os=${quoted(`${info.os} ${info.osVersion}`)}`,
      `arch=${quoted(info.arch)}`,
      `electron=${quoted(info.electron)}`,
    ].join(" "),
    context
  );

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

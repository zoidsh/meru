import { serializeError } from "./errors.ts";

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** The envelope's own keys, which a line's fields may not take. */
type EnvelopeKey = "level" | "message" | "scope" | "time";

/** What a line says beyond its message, as values a reader can filter on; an `error` field is written as `{ name, message, stack }`. */
export type LogFields = Readonly<Record<string, unknown>> &
  Readonly<Partial<Record<EnvelopeKey, never>>>;

/** A levelled, structured log: a message that stays the same from one occurrence to the next, and the fields that vary. */
export interface LogPort {
  readonly debug: (message: string, fields?: LogFields) => void;
  readonly info: (message: string, fields?: LogFields) => void;
  readonly warn: (message: string, fields?: LogFields) => void;
  readonly error: (message: string, fields?: LogFields) => void;
}

export interface LogEntry {
  readonly time: number;
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly fields: LogFields;
}

/** Whether a line at `level` is written when the log keeps `minimum` and above. */
export const logs = (level: LogLevel, minimum: LogLevel): boolean =>
  LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minimum);

/** The longest line written; a line past it keeps its envelope and says how long its fields made it instead. */
export const LINE_CAP = 16 * 1024;

/** The longest text a field keeps, so one long value, such as a page's console message, leaves room for the rest. */
export const TEXT_CAP = 4 * 1024;

const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  // A query string carries tokens, search terms and message ids.
  [
    /(?<address>\b[a-z][\w+.-]*:\/\/[^\s?#"'<>]*)\?[^\s#"'<>]*/giu,
    "$<address>?[redacted]",
  ],
  // Gmail's fragment names the open thread or message, such as #inbox/FMfcg…
  [
    /(?<address>\b[a-z][\w+.-]*:\/\/[^\s#"'<>]*)#[^\s"'<>]+/giu,
    "$<address>#[redacted]",
  ],
  [
    /\b(?<header>(?:proxy-)?authorization)(?<separator>\s*[:=]\s*)[^\n]*/giu,
    "$<header>$<separator>[redacted]",
  ],
  [/\b(?<scheme>bearer|basic)\s+[\w~+/.=-]+/giu, "$<scheme> [redacted]"],
  [
    /\b(?<header>(?:set-)?cookie)(?<separator>\s*[:=]\s*)[^\n]*/giu,
    "$<header>$<separator>[redacted]",
  ],
  [/[\w.+-]+@[a-z\d-]+(?:\.[a-z\d-]+)*\.[a-z]{2,}\b/giu, "[email]"],
];

/** Text with what would identify the user or let a reader act as them taken out: query strings and fragments, credentials and cookie values, email addresses. */
export const redact = (text: string): string => {
  const capped = text.length > TEXT_CAP ? `${text.slice(0, TEXT_CAP)}…` : text;
  let redacted = capped;
  for (const [pattern, replacement] of REDACTIONS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
};

/** A field's value as written: every text in it redacted, at any depth, an `Error` as `{ name, message, stack }`. */
const scrub = (value: unknown, seen: ReadonlySet<unknown>): unknown => {
  if (typeof value === "string") {
    return redact(value);
  }
  if (value instanceof Error) {
    return scrub(serializeError(value), seen);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  const inside = new Set([...seen, value]);
  if (Array.isArray(value)) {
    return value.map((item: unknown) => scrub(item, inside));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, scrub(item, inside)])
  );
};

/** One JSON line per entry, so a file reads with `jq` and every field keeps its type; the fields sit under `fields`, so none can pass for the envelope. */
export const logLine = (entry: LogEntry): string => {
  const fields = Object.fromEntries(
    Object.entries(entry.fields).map(([key, value]) => [
      key,
      scrub(key === "error" ? serializeError(value) : value, new Set()),
    ])
  );
  const envelope = {
    level: entry.level,
    message: redact(entry.message),
    scope: entry.scope,
    time: new Date(entry.time).toISOString(),
  };
  const line = JSON.stringify({
    ...envelope,
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  });
  return line.length > LINE_CAP
    ? `${JSON.stringify({ ...envelope, fields: { truncated: line.length } })}\n`
    : `${line}\n`;
};

/** A log whose every line names `scope`, such as the feature writing it. */
export const scopedLog = (
  write: (entry: Omit<LogEntry, "time">) => void,
  scope: string
): LogPort => ({
  debug: (message, fields = {}) => {
    write({ fields, level: "debug", message, scope });
  },
  error: (message, fields = {}) => {
    write({ fields, level: "error", message, scope });
  },
  info: (message, fields = {}) => {
    write({ fields, level: "info", message, scope });
  },
  warn: (message, fields = {}) => {
    write({ fields, level: "warn", message, scope });
  },
});

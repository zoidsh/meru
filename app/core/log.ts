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

const plain = (value: unknown): unknown =>
  value instanceof Error ? serializeError(value) : value;

/** One JSON line per entry, so a file reads with `jq` and every field keeps its type; the fields sit under `fields`, so none can pass for the envelope. */
export const logLine = (entry: LogEntry): string => {
  const fields = Object.fromEntries(
    Object.entries(entry.fields).map(([key, value]) => [
      key,
      key === "error" ? serializeError(value) : plain(value),
    ])
  );
  return `${JSON.stringify({
    level: entry.level,
    message: entry.message,
    scope: entry.scope,
    time: new Date(entry.time).toISOString(),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  })}\n`;
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

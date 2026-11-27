import { noop } from "es-toolkit";

import { formatLine } from "./log.ts";
import type { Log, LogContext, LogEvent } from "./log.ts";

const EPOCH = new Date(0);
const TIME = `${EPOCH.toISOString()} `;

/**
 * A log that keeps each event and its line as the file would hold it, less
 * the time: `tab-load-failed tab="profile 1 tab 2" code=-105`.
 */
export const recordedLog = (
  context: Partial<LogContext> = {}
): { log: Log; events: LogEvent[]; lines: string[] } => {
  const events: LogEvent[] = [];
  const lines: string[] = [];
  const full: LogContext = {
    ...context,
    profiles: context.profiles ?? (() => []),
  };

  const log = ((name: string, fields: Record<string, unknown> = {}) => {
    const event = { name, fields };

    events.push(event);
    lines.push(formatLine(EPOCH, event, full).slice(TIME.length));
  }) as Log;

  return { log, events, lines };
};

/** A log that puts each line, as `recordedLog` makes it, into `into`. */
export const recordInto = (
  into: unknown[],
  context: Partial<LogContext> = {},
  prefix = ""
): Log => {
  const recorded = recordedLog(context);

  return ((name: string, fields?: Record<string, unknown>) => {
    (recorded.log as (name: string, fields?: unknown) => void)(name, fields);
    into.push(`${prefix}${recorded.lines.at(-1) ?? ""}`);
  }) as Log;
};

/** For a test that reads nothing of what was logged. */
export const silentLog: Log = noop;

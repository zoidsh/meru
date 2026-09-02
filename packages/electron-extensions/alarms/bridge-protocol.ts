/**
 * What `chrome.alarms` says over the extension bridge (`bridge/protocol.ts`),
 * shared by the facade and the main process.
 *
 * The methods are ordinary bridge POSTs. Delivery is the half that needs more
 * than a POST: `onAlarm` has to reach a context that asked for nothing, so a
 * context holding listeners parks a streaming response at `events` and main
 * writes a frame to it every time one of that extension's alarms comes due —
 * the same length-prefixed JSON framing native messaging uses
 * (`native-messaging/framing.ts`).
 */

export const ALARMS_PATHS = {
  create: "/alarms/create",
  get: "/alarms/get",
  getAll: "/alarms/get-all",
  clear: "/alarms/clear",
  clearAll: "/alarms/clear-all",
  events: "/alarms/events",
} as const;

/** Chrome's `Alarm`, which is the whole of what `onAlarm` hands a listener. */
export type AlarmDetails = {
  name: string;
  /** Epoch milliseconds, as Chrome reports it — kept even once it is past. */
  scheduledTime: number;
  periodInMinutes?: number;
};

/** What the extension handed to `create`, taken as untrusted. */
export type AlarmCreateInfo = {
  when?: unknown;
  delayInMinutes?: unknown;
  periodInMinutes?: unknown;
};

export type AlarmsCreateRequest = {
  name: unknown;
  alarmInfo: unknown;
};

export type AlarmsNameRequest = {
  name: unknown;
};

/** Frames on the events response body. Only one kind so far. */
export type AlarmFrame = {
  type: "alarm";
  alarm: AlarmDetails;
};

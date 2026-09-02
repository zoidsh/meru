import type { Session } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import { encodeNativeMessage } from "../native-messaging/framing";
import {
  ALARMS_PATHS,
  type AlarmCreateInfo,
  type AlarmDetails,
  type AlarmFrame,
  type AlarmsCreateRequest,
  type AlarmsNameRequest,
} from "./bridge-protocol";
import {
  type AlarmSchedule,
  createAlarmSchedule,
  getNextScheduledTime,
  MAX_TIMER_DELAY_MS,
} from "./schedule";

const EXTENSION_SCHEME_PREFIX = "chrome-extension://";

/** How long a woken worker has to park its stream before the alarm is dropped. */
const DEFAULT_WAKE_TIMEOUT_MS = 10_000;

/**
 * How many alarms an extension being woken may have waiting at once.
 *
 * Only ever reached with waking turned on, and then only by an extension whose
 * worker will not start: every alarm that comes due while it is down joins the
 * queue. The oldest goes, since an alarm's whole content is that it came due
 * and the newest one says that best.
 */
const MAX_PENDING_ALARMS = 32;

/**
 * How long an alarm's name may be, matching Chrome's own cap.
 *
 * It is also what keeps a delivery frame inside the decoder's limit at the far
 * end: the name is the only part of an `Alarm` an extension chooses the size
 * of, and a name near the frame cap would make every delivery of that alarm
 * unreadable rather than merely large.
 */
const MAX_ALARM_NAME_LENGTH = 512;

/** How many alarms one extension may hold at once, as Chrome caps it. */
const MAX_ALARMS_PER_EXTENSION = 500;

/** Whether a fired alarm may start this extension's stopped service worker. */
export type AlarmWakePolicy = (details: { session: Session; extensionId: string }) => boolean;

export type AlarmsOptions = {
  /**
   * Which extensions a due alarm may wake a stopped service worker for. Without
   * it none are woken and an alarm reaches only the contexts already running,
   * which is what Meru ships: waking an extension whose alarm runs on a minute
   * keeps its worker resident for as long as the account is open, and no
   * curated extension has been measured to need it (see the alarms notes in the
   * feature docs).
   */
  shouldWakeWorker?: AlarmWakePolicy;
  /** How long a wake is waited on before the alarms behind it are dropped. */
  wakeTimeoutMs?: number;
  logger?: ExtensionsLogger;
};

type ScheduledAlarm = AlarmSchedule & {
  name: string;
  timer: NodeJS.Timeout;
};

/**
 * A context's parked events stream. `isWorker` is the bridge's own word rather
 * than the facade's: a service worker's request reaches the handler with no
 * caller stamp, having skipped the `webRequest` listener that mints one, so a
 * frameless caller is the worker (see `stampCaller` in `bridge/bridge.ts`).
 *
 * A page whose frame died between the stamp and the handler arrives frameless
 * too, and is filed as a worker for the life of that stream. It costs nothing:
 * with waking off the flag is never read, and with it on the worst of it is one
 * wake skipped while a stream Electron is about to cancel still stands in for a
 * worker.
 */
type AlarmStream = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  isWorker: boolean;
};

type Wake = {
  timer: NodeJS.Timeout | undefined;
};

type ExtensionAlarms = {
  alarms: Map<string, ScheduledAlarm>;
  streams: Set<AlarmStream>;
  /** Alarms that came due with the worker down, held while it is woken. */
  pendingAlarms: AlarmDetails[];
  wake: Wake | undefined;
};

/**
 * `chrome.alarms` for extensions loaded into Electron sessions, scheduled here
 * and delivered over the extension bridge.
 *
 * Electron ships Chromium's alarm manager and it works: alarms are scheduled,
 * they come due, and their `scheduledTime` advances. What never happens is the
 * delivery — Electron dispatches no `EventRouter` event into an extension
 * service worker, so `onAlarm` fires in extension pages and never in the worker
 * that MV3 puts every background handler in (measured 2 September 2026 on
 * 43.2.0; see finding 31 of the 3.60 extensions review). 1Password's seven
 * alarms are therefore dead, `lockMonitor` and `purge-login-detection-data`
 * among them.
 *
 * The facade replaces the whole namespace rather than filling in around it, in
 * every context and not only the worker: Electron's own alarms live in
 * Chromium's store, and leaving pages on that store while the worker used this
 * one would mean a page's `getAll` could not see what the worker scheduled and
 * its `clear` would silently clear nothing.
 *
 * Alarms live in memory for as long as the session does. Chrome persists them
 * across a browser restart and this does not, which costs nothing measured:
 * what an alarm has to outlive is the service worker, and main outlives it
 * either way, while every alarm 1Password owns is created again at each worker
 * boot.
 */
export class Alarms {
  private shouldWakeWorker: AlarmWakePolicy | undefined;

  private wakeTimeoutMs: number;

  private logger: ExtensionsLogger | undefined;

  private sessions = new Map<Session, Map<string, ExtensionAlarms>>();

  constructor({ shouldWakeWorker, wakeTimeoutMs, logger }: AlarmsOptions = {}) {
    this.shouldWakeWorker = shouldWakeWorker;

    this.wakeTimeoutMs = wakeTimeoutMs ?? DEFAULT_WAKE_TIMEOUT_MS;

    this.logger = logger;
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(ALARMS_PATHS.create, ({ session, extensionId, body, headers }) => {
      const { name, alarmInfo } = body as unknown as AlarmsCreateRequest;

      const created = this.create(
        session,
        extensionId,
        readName(name),
        alarmInfo as AlarmCreateInfo | undefined,
      );

      // Chrome refuses a `create` naming no time at all, and says so by
      // throwing in the extension rather than by making a silent alarm
      return new Response(null, { status: created ? 204 : 400, headers });
    });

    bridge.handle(ALARMS_PATHS.get, ({ session, extensionId, body, headers }) =>
      Response.json(
        this.get(session, extensionId, readName((body as unknown as AlarmsNameRequest).name)),
        { headers },
      ),
    );

    bridge.handle(ALARMS_PATHS.getAll, ({ session, extensionId, headers }) =>
      Response.json(this.getAll(session, extensionId), { headers }),
    );

    bridge.handle(ALARMS_PATHS.clear, ({ session, extensionId, body, headers }) =>
      Response.json(
        this.clear(session, extensionId, readName((body as unknown as AlarmsNameRequest).name)),
        { headers },
      ),
    );

    bridge.handle(ALARMS_PATHS.clearAll, ({ session, extensionId, headers }) =>
      Response.json(this.clearAll(session, extensionId), { headers }),
    );

    bridge.handle(ALARMS_PATHS.events, ({ session, extensionId, senderFrame, headers }) =>
      this.handleEvents(session, extensionId, senderFrame === undefined, headers),
    );
  }

  teardownSession(session: Session) {
    const extensions = this.sessions.get(session);

    if (!extensions) {
      return;
    }

    this.sessions.delete(session);

    for (const entry of extensions.values()) {
      for (const alarm of entry.alarms.values()) {
        clearTimeout(alarm.timer);
      }

      this.clearWake(entry);

      entry.pendingAlarms.length = 0;

      for (const stream of entry.streams) {
        closeStream(stream);
      }
    }
  }

  /**
   * Chrome makes an alarm with the name the extension gave, `""` when it gave
   * none, and one name holds one alarm: creating over a live alarm replaces it
   * rather than adding a second.
   */
  create(
    session: Session,
    extensionId: string,
    name: string,
    alarmInfo: AlarmCreateInfo | undefined,
  ) {
    const schedule = createAlarmSchedule(alarmInfo, Date.now());

    if (!schedule || name.length > MAX_ALARM_NAME_LENGTH) {
      return false;
    }

    const entry = this.getExtensionAlarms(session, extensionId);

    // Replacing one of the extension's own alarms is always allowed; only
    // growing the set past the cap is not
    if (!entry.alarms.has(name) && entry.alarms.size >= MAX_ALARMS_PER_EXTENSION) {
      this.logger?.error("Refused an alarm past the per-extension cap", {
        extensionId,
        name,
        alarms: entry.alarms.size,
      });

      return false;
    }

    this.removeAlarm(entry, name);

    this.armAlarm(session, extensionId, entry, { name, ...schedule });

    return true;
  }

  get(session: Session, extensionId: string, name: string) {
    const alarm = this.sessions.get(session)?.get(extensionId)?.alarms.get(name);

    // JSON has no `undefined`, and the facade reads `null` back as Chrome's own
    // answer for an alarm that is not there
    return alarm ? toAlarmDetails(alarm) : null;
  }

  getAll(session: Session, extensionId: string) {
    const entry = this.sessions.get(session)?.get(extensionId);

    return [...(entry?.alarms.values() ?? [])].map(toAlarmDetails);
  }

  clear(session: Session, extensionId: string, name: string) {
    const entry = this.sessions.get(session)?.get(extensionId);

    return entry ? this.removeAlarm(entry, name) : false;
  }

  /** Chrome answers `true` whether or not there was anything to clear. */
  clearAll(session: Session, extensionId: string) {
    const entry = this.sessions.get(session)?.get(extensionId);

    if (entry) {
      for (const alarm of entry.alarms.values()) {
        clearTimeout(alarm.timer);
      }

      entry.alarms.clear();
    }

    return true;
  }

  private getExtensionAlarms(session: Session, extensionId: string) {
    let extensions = this.sessions.get(session);

    if (!extensions) {
      extensions = new Map();

      this.sessions.set(session, extensions);
    }

    let entry = extensions.get(extensionId);

    if (!entry) {
      entry = { alarms: new Map(), streams: new Set(), pendingAlarms: [], wake: undefined };

      extensions.set(extensionId, entry);
    }

    return entry;
  }

  private removeAlarm(entry: ExtensionAlarms, name: string) {
    const alarm = entry.alarms.get(name);

    if (!alarm) {
      return false;
    }

    clearTimeout(alarm.timer);

    entry.alarms.delete(name);

    return true;
  }

  /**
   * Puts the alarm in its map with a timer running against it. A wait longer
   * than a timer can hold is served by re-arming on the same record, so the
   * alarm the extension sees is one alarm however many timers it took.
   */
  private armAlarm(
    session: Session,
    extensionId: string,
    entry: ExtensionAlarms,
    alarm: Omit<ScheduledAlarm, "timer">,
  ) {
    const remainingMs = Math.max(alarm.scheduledTime - Date.now(), 0);

    const isLastLeg = remainingMs <= MAX_TIMER_DELAY_MS;

    const scheduled: ScheduledAlarm = {
      ...alarm,
      timer: setTimeout(
        () => {
          if (isLastLeg) {
            this.fireAlarm(session, extensionId, entry, alarm.name);
          } else {
            this.armAlarm(session, extensionId, entry, alarm);
          }
        },
        isLastLeg ? remainingMs : MAX_TIMER_DELAY_MS,
      ),
    };

    entry.alarms.set(alarm.name, scheduled);
  }

  /**
   * Chrome hands the listener the time the alarm was due rather than the time
   * it was delivered, and a periodic alarm is due again before its listener has
   * run — so the record is advanced first and what was delivered is a copy.
   */
  private fireAlarm(session: Session, extensionId: string, entry: ExtensionAlarms, name: string) {
    const alarm = entry.alarms.get(name);

    if (!alarm) {
      return;
    }

    const delivered = toAlarmDetails(alarm);

    const nextScheduledTime = getNextScheduledTime(alarm, Date.now());

    if (nextScheduledTime === undefined) {
      entry.alarms.delete(name);
    } else {
      this.armAlarm(session, extensionId, entry, {
        name,
        scheduledTime: nextScheduledTime,
        periodInMinutes: alarm.periodInMinutes,
      });
    }

    this.deliverAlarm(session, extensionId, entry, delivered);
  }

  /**
   * Every context of the extension that parked a stream hears the alarm, the
   * way Chrome dispatches `onAlarm` to the worker and to any extension page
   * open alongside it.
   *
   * An alarm that finds no worker parked is dropped, unless this extension is
   * one waking is turned on for: Chrome's alarm wakes the worker it delivers
   * to, and where Meru chooses not to wake, dropping is the honest half of that
   * — queueing would deliver a stack of alarms whenever the worker next came up
   * for its own reasons, which is a thing Chrome never does.
   */
  private deliverAlarm(
    session: Session,
    extensionId: string,
    entry: ExtensionAlarms,
    alarm: AlarmDetails,
  ) {
    const frame = encodeNativeMessage({ type: "alarm", alarm } satisfies AlarmFrame);

    // Deleting the current entry mid-iteration is safe on a Set, and the
    // survivors are what the wake below is decided on
    for (const stream of entry.streams) {
      try {
        stream.controller.enqueue(frame);
      } catch {
        // A stream whose context went away without canceling
        entry.streams.delete(stream);
      }
    }

    // Read off what survived the delivery, so a worker stream that turned out
    // to be dead is a worker to wake rather than one already reached
    let hasWorker = false;

    for (const stream of entry.streams) {
      hasWorker ||= stream.isWorker;
    }

    if (hasWorker || !this.shouldWakeWorker?.({ session, extensionId })) {
      return;
    }

    entry.pendingAlarms.push(alarm);

    while (entry.pendingAlarms.length > MAX_PENDING_ALARMS) {
      entry.pendingAlarms.shift();
    }

    this.wakeWorker(session, extensionId, entry);
  }

  /**
   * `startWorkerForScope` starts the extension's worker, or does nothing when
   * it is already running and simply has not parked its stream yet. Either way
   * the alarms behind it wait for a worker stream, bounded by the wake timeout.
   * The API is experimental on Electron 43, and the call is typed against
   * Electron's own `Session`, so its going away is a type error rather than a
   * silent nothing.
   */
  private wakeWorker(session: Session, extensionId: string, entry: ExtensionAlarms) {
    if (entry.wake) {
      return;
    }

    const wake: Wake = { timer: undefined };

    entry.wake = wake;

    wake.timer = setTimeout(() => {
      if (entry.wake !== wake) {
        return;
      }

      entry.wake = undefined;

      if (entry.pendingAlarms.length > 0) {
        this.logger?.info("Dropped alarms for a worker that did not wake", {
          extensionId,
          alarms: entry.pendingAlarms.length,
        });

        entry.pendingAlarms.length = 0;
      }
    }, this.wakeTimeoutMs);

    Promise.resolve()
      .then(() =>
        session.serviceWorkers.startWorkerForScope(`${EXTENSION_SCHEME_PREFIX}${extensionId}/`),
      )
      .catch((error: unknown) => {
        this.logger?.error("Failed to wake a service worker for an alarm", {
          extensionId,
          error,
        });
      });
  }

  /** Ends the wait for a worker, leaving what is waiting on it to the caller. */
  private clearWake(entry: ExtensionAlarms) {
    if (entry.wake?.timer) {
      clearTimeout(entry.wake.timer);
    }

    entry.wake = undefined;
  }

  /**
   * The stream a context parks to hear `onAlarm`. It is opened by the first
   * listener the context adds and lives as long as the context does, so its
   * cancel is how a closed page or a stopped worker is noticed.
   *
   * That cancel is the only thing pruning a dead context's stream, and it is
   * enough because Electron fires it on frame destruction, on navigation and on
   * worker death — measured for the native messaging port streams this shape
   * comes from. The runtime proxy invalidates its own worker streams from the
   * session's `running-status-changed` events instead, and needs to: a job it
   * hands over has to be known delivered, so a stream that merely looks live
   * costs it a lost message. Nothing here is owed that. A dead stream that has
   * not been canceled yet only means one delivery enqueued into a buffer
   * nothing reads, and the alarm behind it is one this code would have dropped
   * anyway.
   */
  private handleEvents(
    session: Session,
    extensionId: string,
    isWorker: boolean,
    headers: Record<string, string>,
  ) {
    const entry = this.getExtensionAlarms(session, extensionId);

    let stream: AlarmStream | undefined;

    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        stream = { controller, isWorker };

        entry.streams.add(stream);
      },
      cancel: () => {
        if (stream) {
          entry.streams.delete(stream);
        }
      },
    });

    if (stream && isWorker) {
      this.flushPendingAlarms(entry, stream);
    }

    return new Response(body, {
      headers: { ...headers, "content-type": "application/octet-stream" },
    });
  }

  /** What came due while the worker was being woken, in the order it came due. */
  private flushPendingAlarms(entry: ExtensionAlarms, stream: AlarmStream) {
    this.clearWake(entry);

    const pendingAlarms = entry.pendingAlarms.splice(0);

    for (const alarm of pendingAlarms) {
      try {
        stream.controller.enqueue(
          encodeNativeMessage({ type: "alarm", alarm } satisfies AlarmFrame),
        );
      } catch {
        entry.streams.delete(stream);

        return;
      }
    }
  }
}

/** Chrome takes a missing name as `""`, which is an ordinary alarm name. */
function readName(name: unknown) {
  return typeof name === "string" ? name : "";
}

function toAlarmDetails({ name, scheduledTime, periodInMinutes }: ScheduledAlarm): AlarmDetails {
  return periodInMinutes === undefined
    ? { name, scheduledTime }
    : { name, scheduledTime, periodInMinutes };
}

function closeStream(stream: AlarmStream) {
  try {
    stream.controller.close();
  } catch {
    // Already closed with its context, which is the ordinary way one ends
  }
}

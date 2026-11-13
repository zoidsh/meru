import { clamp } from "es-toolkit";
import { z } from "zod";

import { DisposableStore } from "../../../core/disposable.ts";
import {
  deriveEntitlement,
  sameGrant,
} from "../../../core/entitlement/derive.ts";
import {
  due,
  fallsBackToFree,
  nextDelay,
  nextWake,
} from "../../../core/entitlement/schedule.ts";
import type { Claims } from "../../../core/entitlement/token.ts";
import { verifyToken } from "../../../core/entitlement/verify.ts";
import type { Ed25519Subtle } from "../../../core/entitlement/verify.ts";
import type { AppEvents } from "../../../core/events.ts";
import type {
  LifecyclePort,
  Clock,
  EntitlementAnswer,
  EntitlementApi,
  EntitlementApiError,
  FsPort,
  Ids,
  OnlinePort,
  PowerPort,
  Unsubscribe,
} from "../../../core/ports.ts";
import type {
  Entitlement as EntitlementValue,
  EntitlementSource,
} from "../../../core/records/entitlement.ts";
import { idSchema } from "../../../core/records/id.ts";
import { err, ok } from "../../../core/result.ts";
import { SnapshotStore } from "../../../core/snapshot.ts";
import type { SnapshotSpec } from "../../../core/snapshot.ts";
import { parseField } from "../../../core/values.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import {
  entitlement as channels,
  entitlementPushes,
} from "../../../shared/channels/entitlement.ts";

export const ENTITLEMENT_FILE = "entitlement.json";

const licenseKeySchema = z.string().min(1).nullable();

const lastAnswerSchema = z.object({
  /** Milliseconds since the epoch. */
  at: z.number().int(),
  detail: z.string().nullable(),
  outcome: z.enum(["issued", "offline", "rejected", "serverError", "invalid"]),
});

export const entitlementStateSchema = z.object({
  /** Names this device to the API; a token is issued to one device id. */
  deviceId: idSchema,
  licenseKey: licenseKeySchema,
  lastAnswer: lastAnswerSchema.nullable(),
  /** The license key the API last refused, and when; asked about again an hour later, or as soon as the key changes. */
  rejected: z
    .object({ at: z.number().int(), licenseKey: z.string().min(1) })
    .nullable(),
  token: z
    .object({
      /** The license key the token was issued for, so a changed key asks again. */
      licenseKey: licenseKeySchema,
      value: z.string().min(1),
    })
    .nullable(),
});

export type EntitlementState = z.infer<typeof entitlementStateSchema>;

export type LastAnswer = z.infer<typeof lastAnswerSchema>;

/** A field of entitlement.json that could not be read and was replaced. */
export type EntitlementFallback = keyof EntitlementState;

export const entitlementSnapshot = (
  ids: Ids
): SnapshotSpec<EntitlementState, EntitlementFallback> => ({
  migrations: [],
  name: ENTITLEMENT_FILE,
  // A token is bound to the device id, so the id is kept whenever it can be, and a new one is made only when it is gone.
  recover: (data) => {
    const deviceId = parseField(data, "deviceId", idSchema);
    const licenseKey = parseField(data, "licenseKey", licenseKeySchema);
    const state: EntitlementState = {
      deviceId: deviceId ?? ids(),
      lastAnswer: null,
      licenseKey: licenseKey ?? null,
      rejected: null,
      token: null,
    };
    const fallbacks: EntitlementFallback[] = [];
    if (deviceId === undefined) {
      fallbacks.push("deviceId");
    }
    if (data !== undefined) {
      if (licenseKey === undefined) {
        fallbacks.push("licenseKey");
      }
      fallbacks.push("token");
    }
    return { fallbacks, value: state };
  },
  schema: entitlementStateSchema,
  version: 1,
});

export interface EntitlementOptions<K> {
  readonly api: EntitlementApi;
  readonly fs: FsPort;
  readonly lifecycle: Pick<LifecyclePort, "onQuit">;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly online: OnlinePort;
  readonly power: PowerPort;
  readonly events: AppEvents;
  readonly registrar: IpcRegistrar;
  readonly subtle: Ed25519Subtle<K>;
  /** The accepted public keys by key id. */
  readonly keys: ReadonlyMap<string, K>;
  readonly report: (message: string) => void;
  readonly onError: (error: unknown) => void;
}

/** How far this device's clock may run ahead of the API's before a token counts as expired. */
const SKEW_SECONDS = 300;
// setTimeout fires at once for a delay past a signed 32-bit millisecond count.
const LONGEST_DELAY = 2 ** 31 - 1;

const describeError = (error: EntitlementApiError) =>
  error.kind === "rejected" ? error.reason : error.detail;

export class Entitlement<K> {
  readonly #options: EntitlementOptions<K>;
  readonly #store: SnapshotStore<EntitlementState, EntitlementFallback>;
  readonly #disposables = new DisposableStore();
  #state: EntitlementState | undefined;
  #claims: Claims | undefined;
  #source: EntitlementSource = "stored";
  #value: EntitlementValue = {
    expiresAt: null,
    kind: "unknown",
    source: "stored",
  };
  #started = false;
  #refreshing = false;
  /** How long the next refresh waits, growing with each one in a row that brought no token. */
  #delay = 0;
  #timer: Unsubscribe | undefined;
  #waiting: Unsubscribe | undefined;

  constructor(options: EntitlementOptions<K>) {
    this.#options = options;
    this.#store = new SnapshotStore(entitlementSnapshot(options.ids), {
      lifecycle: options.lifecycle,
      clock: options.clock,
      fs: options.fs,
      onError: options.onError,
    });
  }

  /** Reads the stored token and derives the value from it, with no network. */
  async open(): Promise<void> {
    const opened = await this.#store.open();
    this.#state = opened.value;
    if (opened.source !== "file" || opened.fallbacks.length > 0) {
      this.#store.write(opened.value);
    }
    const stored = opened.value.token;
    if (stored !== null) {
      const claims = await this.#verify(stored.value);
      if (claims === undefined) {
        this.#save({ ...opened.value, token: null });
      }
      this.#claims = claims;
    }
    this.#derive();
  }

  /** Answers pages from the value as it stands, before the window shows. */
  attach(): void {
    this.#disposables.add(
      () => {
        this.#store.dispose();
      },
      this.#options.registrar.register(channels, {
        snapshot: () => ok(this.#value),
      })
    );
  }

  /** Refreshes behind the window whenever the token has expired, never blocking and never asking the user. */
  start(): void {
    this.#started = true;
    this.#disposables.add(
      () => {
        this.#started = false;
        this.#cancel();
      },
      // Timers stop while the machine sleeps, so a token that expired during a sleep would otherwise wait out the rest of the timer.
      this.#options.power.onResume(() => {
        this.#schedule();
      })
    );
    this.#schedule();
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  current(): EntitlementValue {
    return this.#value;
  }

  /** Stores the license key, or removes it for null, and asks for a token for it. */
  setLicenseKey(licenseKey: string | null): void {
    if (this.#state === undefined || this.#state.licenseKey === licenseKey) {
      return;
    }
    this.#save({ ...this.#state, licenseKey, rejected: null });
    this.#delay = 0;
    this.#schedule();
  }

  async flush(): Promise<void> {
    await this.#store.flush();
  }

  #cancel() {
    this.#timer?.();
    this.#timer = undefined;
    this.#waiting?.();
    this.#waiting = undefined;
  }

  #at(time: number, task: () => void) {
    this.#timer = this.#options.clock.schedule(
      clamp(time - this.#options.clock.now(), 0, LONGEST_DELAY),
      task
    );
  }

  #schedule() {
    this.#cancel();
    this.#derive();
    const state = this.#state;
    if (!this.#started || this.#refreshing || state === undefined) {
      return;
    }
    const { clock, online } = this.#options;
    const now = clock.now();
    const asked = due(state, this.#claims, now);
    if (asked === undefined) {
      this.#delay = 0;
      const wake = nextWake(state, this.#claims, now);
      if (wake !== undefined) {
        this.#at(wake, () => {
          this.#schedule();
        });
      }
      return;
    }
    if (!online.isOnline()) {
      this.#waiting = online.onChange((connected) => {
        if (connected) {
          this.#delay = 0;
          this.#schedule();
        }
      });
      return;
    }
    if (this.#delay === 0) {
      void this.#refresh(state, asked.licenseKey);
      return;
    }
    this.#at(now + this.#delay, () => {
      void this.#refresh(state, asked.licenseKey);
    });
  }

  async #refresh(asked: EntitlementState, licenseKey: string | null) {
    this.#cancel();
    this.#refreshing = true;
    const { api, clock, report } = this.#options;
    const { deviceId } = asked;
    let answer: EntitlementAnswer;
    try {
      answer = await api.issue({ deviceId, licenseKey });
    } catch (error) {
      answer = err({ detail: String(error), kind: "serverError" });
    }
    let outcome: LastAnswer;
    if (answer.ok) {
      const claims = await this.#verify(answer.value.token);
      if (claims === undefined) {
        outcome = { at: clock.now(), detail: null, outcome: "invalid" };
      } else {
        outcome = { at: clock.now(), detail: null, outcome: "issued" };
        this.#claims = claims;
        this.#source = "refreshed";
        const current = this.#state ?? asked;
        this.#state = {
          ...current,
          rejected: licenseKey === null ? current.rejected : null,
          token: { licenseKey, value: answer.value.token },
        };
      }
    } else {
      outcome = {
        at: clock.now(),
        detail: describeError(answer.error),
        outcome: answer.error.kind,
      };
      report(
        `entitlement: the API answered ${answer.error.kind}: ${describeError(answer.error)}`
      );
    }
    const saved = this.#state ?? asked;
    if (outcome.outcome === "rejected" && licenseKey !== null) {
      // The same key gets the same refusal, so it is asked again an hour on, or once the key changes, and the device falls back to its trial meanwhile.
      this.#save({
        ...saved,
        lastAnswer: outcome,
        rejected: { at: outcome.at, licenseKey },
      });
    } else {
      this.#save({ ...saved, lastAnswer: outcome });
    }
    this.#delay = nextDelay(this.#delay, outcome.outcome, licenseKey);
    this.#refreshing = false;
    this.#schedule();
  }

  /** The claims of a token signed for this device, expired or not; undefined, and reported, for any other token. */
  async #verify(text: string): Promise<Claims | undefined> {
    const { clock, keys, report, subtle } = this.#options;
    const deviceId = this.#state?.deviceId ?? "";
    const verified = await verifyToken(text, {
      deviceId,
      keys,
      now: clock.now(),
      skewSeconds: SKEW_SECONDS,
      subtle,
    });
    if (verified.ok) {
      return verified.value;
    }
    if (verified.error.kind === "expired") {
      return verified.error.claims;
    }
    report(`entitlement: a token was refused as ${verified.error.kind}`);
    return undefined;
  }

  #save(state: EntitlementState) {
    this.#state = state;
    this.#store.write(state);
  }

  #derive() {
    const now = this.#options.clock.now();
    const state = this.#state;
    const next: EntitlementValue =
      state !== undefined && fallsBackToFree(state, this.#claims, now)
        ? { expiresAt: null, kind: "free", source: this.#source }
        : deriveEntitlement(
            this.#claims,
            now,
            this.#claims === undefined ? "stored" : this.#source
          );
    const previous = this.#value;
    this.#value = next;
    if (sameGrant(previous, next)) {
      return;
    }
    this.#options.registrar.broadcast(entitlementPushes.changed, next);
    this.#options.events.emit("entitlement.changed", { entitlement: next });
  }
}

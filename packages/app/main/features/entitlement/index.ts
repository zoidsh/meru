import { z } from "zod";

import {
  deriveEntitlement,
  sameGrant,
} from "../../../core/entitlement/derive.ts";
import type { Claims } from "../../../core/entitlement/token.ts";
import { isExpired, verifyToken } from "../../../core/entitlement/verify.ts";
import type { Ed25519Subtle } from "../../../core/entitlement/verify.ts";
import type { AppEvents } from "../../../core/events.ts";
import type {
  AppPort,
  Clock,
  EntitlementApi,
  EntitlementApiError,
  FsPort,
  Ids,
  OnlinePort,
  Unsubscribe,
} from "../../../core/ports.ts";
import type {
  Entitlement as EntitlementValue,
  EntitlementSource,
} from "../../../core/records/entitlement.ts";
import { idSchema } from "../../../core/records/id.ts";
import { ok } from "../../../core/result.ts";
import { SnapshotStore } from "../../../core/snapshot.ts";
import type { SnapshotSpec } from "../../../core/snapshot.ts";
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

const field = <S extends z.ZodType>(
  data: unknown,
  key: EntitlementFallback,
  schema: S
): z.output<S> | undefined => {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const parsed = schema.safeParse(Reflect.get(data, key));
  return parsed.success ? parsed.data : undefined;
};

export const entitlementSnapshot = (
  ids: Ids
): SnapshotSpec<EntitlementState, EntitlementFallback> => ({
  migrations: [],
  name: ENTITLEMENT_FILE,
  // A token is bound to the device id, so the id is kept whenever it can be, and a new one is made only when it is gone.
  recover: (data) => {
    const deviceId = field(data, "deviceId", idSchema);
    const licenseKey = field(data, "licenseKey", licenseKeySchema);
    const state: EntitlementState = {
      deviceId: deviceId ?? ids(),
      lastAnswer: null,
      licenseKey: licenseKey ?? null,
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

export type EntitlementListener = (entitlement: EntitlementValue) => void;

export interface EntitlementOptions<K> {
  readonly api: EntitlementApi;
  readonly fs: FsPort;
  readonly app: Pick<AppPort, "onQuit">;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly network: OnlinePort;
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
const RETRY_FIRST = 60_000;
const RETRY_MAX = 3_600_000;
// setTimeout fires at once for a delay past a signed 32-bit millisecond count.
const LONGEST_DELAY = 2 ** 31 - 1;

const describeError = (error: EntitlementApiError) =>
  error.kind === "rejected" ? error.reason : error.detail;

export class Entitlement<K> {
  readonly #options: EntitlementOptions<K>;
  readonly #store: SnapshotStore<EntitlementState, EntitlementFallback>;
  readonly #listeners = new Set<EntitlementListener>();
  readonly #pages = new Set<number>();
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
      app: options.app,
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
  attach(): Unsubscribe {
    const unregister = this.#options.registrar.register(channels, {
      snapshot: (_payload, { contentsId }) => {
        this.#pages.add(contentsId);
        return ok(this.#value);
      },
    });
    return () => {
      unregister();
      this.#pages.clear();
    };
  }

  /** Refreshes behind the window whenever the token has expired, never blocking and never asking the user. */
  start(): Unsubscribe {
    this.#started = true;
    this.#schedule();
    return () => {
      this.#started = false;
      this.#cancel();
      this.#store.dispose();
    };
  }

  current(): EntitlementValue {
    return this.#value;
  }

  subscribe(listener: EntitlementListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Stores the license key, or removes it for null, and asks for a token for it. */
  setLicenseKey(licenseKey: string | null): void {
    if (this.#state === undefined || this.#state.licenseKey === licenseKey) {
      return;
    }
    this.#save({ ...this.#state, licenseKey });
    this.#delay = 0;
    this.#schedule();
  }

  /** Writes what is pending now. */
  async flush(): Promise<void> {
    await this.#store.flush();
  }

  #needsToken(state: EntitlementState): boolean {
    return (
      this.#claims === undefined ||
      state.token?.licenseKey !== state.licenseKey ||
      isExpired(this.#claims, this.#options.clock.now(), 0)
    );
  }

  #cancel() {
    this.#timer?.();
    this.#timer = undefined;
    this.#waiting?.();
    this.#waiting = undefined;
  }

  #at(time: number, task: () => void) {
    const delay = Math.max(0, time - this.#options.clock.now());
    this.#timer = this.#options.clock.schedule(
      Math.min(delay, LONGEST_DELAY),
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
    const { clock, network } = this.#options;
    if (!this.#needsToken(state)) {
      this.#delay = 0;
      const claims = this.#claims;
      const next = claims === undefined ? [] : [claims.exp * 1000];
      const endsAt = (claims?.endsAt ?? 0) * 1000;
      if (endsAt > clock.now()) {
        next.push(endsAt);
      }
      this.#at(Math.min(...next), () => {
        this.#schedule();
      });
      return;
    }
    if (!network.isOnline()) {
      this.#waiting = network.onChange((online) => {
        if (online) {
          this.#delay = 0;
          this.#schedule();
        }
      });
      return;
    }
    if (this.#delay === 0) {
      void this.#refresh(state);
      return;
    }
    this.#at(clock.now() + this.#delay, () => {
      void this.#refresh(state);
    });
  }

  async #refresh(asked: EntitlementState) {
    this.#cancel();
    this.#refreshing = true;
    const { api, clock, report } = this.#options;
    const { deviceId, licenseKey } = asked;
    let answer: Awaited<ReturnType<EntitlementApi["issue"]>>;
    try {
      answer = await api.issue({ deviceId, licenseKey });
    } catch (error) {
      answer = {
        error: { detail: String(error), kind: "serverError" },
        ok: false,
      };
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
    this.#save({ ...(this.#state ?? asked), lastAnswer: outcome });
    if (outcome.outcome === "issued") {
      this.#delay = 0;
    } else if (outcome.outcome === "rejected") {
      // The same key gets the same refusal, so it is asked again only at the longest spacing or once the key changes.
      this.#delay = RETRY_MAX;
    } else {
      this.#delay = Math.min(Math.max(this.#delay * 2, RETRY_FIRST), RETRY_MAX);
    }
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
    const next = deriveEntitlement(
      this.#claims,
      this.#options.clock.now(),
      this.#claims === undefined ? "stored" : this.#source
    );
    const previous = this.#value;
    this.#value = next;
    if (sameGrant(previous, next)) {
      return;
    }
    for (const contentsId of this.#pages) {
      this.#options.registrar.push(contentsId, entitlementPushes.changed, next);
    }
    for (const listener of this.#listeners) {
      listener(next);
    }
    this.#options.events.emit("entitlement.changed", {
      entitlement: next,
      reason: next.kind === "disabled" ? next.reason : null,
    });
  }
}

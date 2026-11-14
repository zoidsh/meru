import { DisposableStore } from "../../../core/disposable.ts";
import { parseSettings } from "../../../core/engines/settings-parse.ts";
import type { Fallback } from "../../../core/engines/settings-parse.ts";
import {
  diff,
  emptySettings,
  resolve,
  storedValue,
  withoutProfile,
  withValue,
} from "../../../core/engines/settings.ts";
import type { SettingChange } from "../../../core/engines/settings.ts";
import { canUse } from "../../../core/entitlement/gate.ts";
import type { GateRefusal } from "../../../core/entitlement/gate.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { LogPort } from "../../../core/log.ts";
import type {
  LifecyclePort,
  Clock,
  FsPort,
  Unsubscribe,
} from "../../../core/ports.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import { SnapshotStore } from "../../../core/snapshot.ts";
import type { Opened, SnapshotSpec } from "../../../core/snapshot.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import {
  settings as channels,
  settingsPushes,
} from "../../../shared/channels/settings.ts";
import { registry } from "../../../shared/settings/registry.ts";
import type {
  ProfileArg,
  SettingKey,
  Settings,
  SettingValue,
} from "../../../shared/settings/registry.ts";
import {
  settingChangeSchema,
  settingsSchema,
} from "../../../shared/settings/schema.ts";
import type {
  Locked,
  SettingChangeMessage,
} from "../../../shared/settings/schema.ts";

export const SETTINGS_FILE = "settings.json";

export const settingsSnapshot: SnapshotSpec<Settings, Fallback> = {
  migrations: [],
  name: SETTINGS_FILE,
  recover: (data) => {
    const { settings, fallbacks } = parseSettings(registry, data);
    return { fallbacks, value: settings };
  },
  schema: settingsSchema,
  version: 1,
};

export type SettingsListener = (
  changes: readonly SettingChange<typeof registry>[]
) => void;

export interface SettingsOptions {
  readonly fs: FsPort;
  readonly clock: Clock;
  readonly lifecycle: Pick<LifecyclePort, "onQuit">;
  readonly registrar: IpcRegistrar;
  /** Follow edits made to the file by hand while the app runs. */
  readonly watchFile: boolean;
  /** What the user may use now, which a Pro setting's value waits on. */
  readonly entitlement: () => Entitlement;
  readonly events: Pick<AppEvents, "on">;
  readonly log: LogPort;
}

const PRO_KEYS: ReadonlySet<SettingKey> = new Set(
  registry.filter((entry) => entry.tier === "pro").map((entry) => entry.key)
);

// Editors save in several steps, each reported as a change.
const SETTLE = 50;

export class SettingsStore {
  readonly #options: SettingsOptions;
  readonly #store: SnapshotStore<Settings, Fallback>;
  readonly #listeners = new Set<SettingsListener>();
  readonly #disposables = new DisposableStore();
  #settings: Settings = emptySettings();
  #refusal: GateRefusal | null = null;

  constructor(options: SettingsOptions) {
    this.#options = options;
    this.#store = new SnapshotStore(settingsSnapshot, {
      lifecycle: options.lifecycle,
      clock: options.clock,
      fs: options.fs,
      log: options.log,
    });
  }

  async open(): Promise<Opened<Settings, Fallback>> {
    const opened = await this.#store.open();
    this.#settings = opened.value;
    const fallbacks: readonly Fallback[] =
      opened.source === "file" || opened.source === "missing"
        ? opened.fallbacks
        : [{ key: null, profileId: null, reason: "invalid" }];
    if (fallbacks.length > 0) {
      this.#fellBack(fallbacks);
    }
    return opened;
  }

  start(): void {
    const { registrar, fs, clock, events } = this.#options;
    this.#refusal = this.#proRefusal();
    this.#disposables.add(
      events.on("entitlement.changed", () => {
        this.#regate();
      }),
      () => {
        this.#store.dispose();
      },
      registrar.register(channels, {
        set: ({ key, value, profileId }) => {
          if (this.locked()[key] !== undefined) {
            return err(`${key} is locked`);
          }
          const result = this.#set(key, value, profileId);
          return result.ok ? ok(null) : result;
        },
        snapshot: () => ok({ layers: this.#settings, locked: this.locked() }),
      })
    );
    if (this.#options.watchFile) {
      let cancel: Unsubscribe | undefined;
      this.#disposables.add(
        fs.watch(SETTINGS_FILE, () => {
          cancel ??= clock.schedule(SETTLE, () => {
            cancel = undefined;
            void this.#reload();
          });
        }),
        () => {
          cancel?.();
        }
      );
    }
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  get settings(): Settings {
    return this.#settings;
  }

  /** The value in force: a Pro setting's default while the entitlement refuses Pro, whatever is stored. */
  get<K extends SettingKey>(key: K, ...profile: ProfileArg<K>) {
    const [profileId] = profile;
    const layers =
      PRO_KEYS.has(key) && this.#proRefusal() !== null
        ? emptySettings()
        : this.#settings;
    return resolve(registry, layers, key, profileId);
  }

  /** The keys whose stored value the entitlement holds back, each with the gate's reason. */
  locked(): Locked {
    const refusal = this.#proRefusal();
    const locked: Partial<Record<SettingKey, GateRefusal>> = {};
    if (refusal !== null) {
      for (const key of PRO_KEYS) {
        locked[key] = refusal;
      }
    }
    return locked;
  }

  /** Stores a value, or removes it when `value` is undefined, so the next layer down shows through. */
  set<K extends SettingKey>(
    key: K,
    value: SettingValue<K> | undefined,
    ...profile: ProfileArg<K>
  ): Result<undefined, string> {
    return this.#set(key, value, ...profile);
  }

  /** Drops a removed profile's override layer. */
  removeProfile(profileId: string): void {
    if (this.#replace(withoutProfile(this.#settings, profileId))) {
      this.#store.write(this.#settings);
    }
  }

  subscribe(listener: SettingsListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async flush(): Promise<void> {
    await this.#store.flush();
  }

  #set(
    key: SettingKey,
    value: unknown,
    profileId?: string
  ): Result<undefined, string> {
    const next = withValue(registry, this.#settings, key, value, profileId);
    if (!next.ok) {
      return next;
    }
    if (this.#replace(next.value)) {
      this.#store.write(this.#settings);
    }
    return ok(undefined);
  }

  #proRefusal(): GateRefusal | null {
    const gate = canUse(this.#options.entitlement(), "proSetting", {
      now: this.#options.clock.now(),
    });
    return gate.allowed ? null : gate.reason;
  }

  // A Pro setting's stored value comes into force, or goes, with the entitlement, so the features reading it hear of it as of any change, in every layer that stores it.
  #regate(): void {
    const refusal = this.#proRefusal();
    if (refusal === this.#refusal) {
      return;
    }
    const wasAllowed = this.#refusal === null;
    this.#refusal = refusal;
    this.#options.registrar.broadcast(settingsPushes.changed, {
      changes: [],
      locked: this.locked(),
    });
    if (wasAllowed === (refusal === null)) {
      return;
    }
    const changes: SettingChange<typeof registry>[] = [...PRO_KEYS].flatMap(
      (key) => [
        { key, profileId: null },
        ...Object.keys(this.#settings.profiles)
          .filter(
            (profileId) =>
              storedValue(this.#settings, { key, profileId }) !== undefined
          )
          .map((profileId) => ({ key, profileId })),
      ]
    );
    for (const listener of this.#listeners) {
      listener(changes);
    }
  }

  #fellBack(fallbacks: readonly Fallback[]): void {
    for (const { key, profileId, reason } of fallbacks) {
      this.#options.log.warn("A setting fell back to its default", {
        key,
        profileId,
        reason,
      });
    }
  }

  async #reload(): Promise<void> {
    const opened = await this.#store.reload();
    if (opened === undefined) {
      return;
    }
    if (opened.fallbacks.length > 0) {
      this.#fellBack(opened.fallbacks);
    }
    this.#replace(opened.value);
  }

  #replace(next: Settings): boolean {
    const changes = diff(this.#settings, next);
    if (changes.length === 0) {
      return false;
    }
    this.#settings = next;
    const messages = changes.flatMap((change): SettingChangeMessage[] => {
      const parsed = settingChangeSchema.safeParse({
        ...change,
        value: storedValue(next, change),
      });
      return parsed.success ? [parsed.data] : [];
    });
    this.#options.registrar.broadcast(settingsPushes.changed, {
      changes: messages,
      locked: this.locked(),
    });
    for (const listener of this.#listeners) {
      listener(changes);
    }
    return true;
  }
}

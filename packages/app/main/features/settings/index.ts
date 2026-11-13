import {
  diff,
  emptySettings,
  parseSettings,
  resolve,
  storedValue,
  withoutProfile,
  withValue,
} from "../../../core/engines/settings.ts";
import type {
  Fallback,
  SettingChange,
} from "../../../core/engines/settings.ts";
import type {
  AppPort,
  Clock,
  FsPort,
  Unsubscribe,
} from "../../../core/ports.ts";
import { ok } from "../../../core/result.ts";
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
  ProfileSettingKey,
  SettingKey,
  Settings,
  SettingValue,
} from "../../../shared/settings/registry.ts";
import {
  settingChangeSchema,
  settingsSchema,
} from "../../../shared/settings/schema.ts";
import type { SettingChangeMessage } from "../../../shared/settings/schema.ts";

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

/** A profile names its layer only for a key a profile may override. */
export type ProfileArg<K extends SettingKey> = K extends ProfileSettingKey
  ? [profileId?: string]
  : [];

export type SettingsListener = (changes: readonly SettingChange[]) => void;

export interface SettingsOptions {
  readonly fs: FsPort;
  readonly clock: Clock;
  readonly app: Pick<AppPort, "onQuit">;
  readonly registrar: IpcRegistrar;
  /** Follow edits made to the file by hand while the app runs. */
  readonly watchFile: boolean;
  readonly onError: (error: unknown) => void;
  readonly onFallback: (fallbacks: readonly Fallback[]) => void;
}

// Editors save in several steps, each reported as a change.
const SETTLE = 50;

export class SettingsStore {
  readonly #options: SettingsOptions;
  readonly #store: SnapshotStore<Settings, Fallback>;
  readonly #listeners = new Set<SettingsListener>();
  readonly #pages = new Set<number>();
  #settings: Settings = emptySettings();

  constructor(options: SettingsOptions) {
    this.#options = options;
    this.#store = new SnapshotStore(settingsSnapshot, {
      app: options.app,
      clock: options.clock,
      fs: options.fs,
      onError: options.onError,
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
      this.#options.onFallback(fallbacks);
    }
    return opened;
  }

  start(): Unsubscribe {
    const { registrar, fs, clock } = this.#options;
    const removers = [
      registrar.register(channels, {
        set: ({ key, value, profileId }) => {
          const result = this.#set(key, value, profileId);
          return result.ok ? ok(null) : result;
        },
        snapshot: (_payload, { contentsId }) => {
          this.#pages.add(contentsId);
          return ok(this.#settings);
        },
      }),
    ];
    if (this.#options.watchFile) {
      let cancel: Unsubscribe | undefined;
      removers.push(
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
    return () => {
      for (const remove of removers) {
        remove();
      }
      this.#store.dispose();
    };
  }

  get settings(): Settings {
    return this.#settings;
  }

  get<K extends SettingKey>(key: K, ...profile: ProfileArg<K>) {
    const [profileId] = profile;
    return resolve(registry, this.#settings, key, profileId);
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

  /** Writes what is pending now. */
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

  async #reload(): Promise<void> {
    const opened = await this.#store.reload();
    if (opened === undefined) {
      return;
    }
    if (opened.fallbacks.length > 0) {
      this.#options.onFallback(opened.fallbacks);
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
    for (const contentsId of this.#pages) {
      this.#options.registrar.push(contentsId, settingsPushes.changed, {
        changes: messages,
      });
    }
    for (const listener of this.#listeners) {
      listener(changes);
    }
    return true;
  }
}

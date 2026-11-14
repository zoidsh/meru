import type { z } from "zod";

import { envelopeSchema, migrate } from "./engines/migrate.ts";
import type { Migration } from "./engines/migrate.ts";
import type { LogPort } from "./log.ts";
import type { LifecyclePort, Clock, FsPort, Unsubscribe } from "./ports.ts";

export interface Recovered<T, F> {
  readonly value: T;
  readonly fallbacks: readonly F[];
}

export interface SnapshotSpec<T, F> {
  /** One file under the user data directory. */
  readonly name: string;
  readonly version: number;
  /** `migrations[0]` takes version 1 to 2; there is one per version before the current. */
  readonly migrations: readonly Migration[];
  readonly schema: z.ZodType<T>;
  /** Makes a value from whatever the schema refused, or from nothing when there was no usable file, and says what it left out. */
  readonly recover: (data: unknown) => Recovered<T, F>;
}

export type SnapshotSource =
  | "file"
  | "missing"
  | "unreadable"
  | "corrupt"
  | "newer"
  | "failedMigration";

export interface Opened<T, F> extends Recovered<T, F> {
  readonly source: SnapshotSource;
}

export interface SnapshotPorts {
  readonly fs: FsPort;
  readonly clock: Clock;
  readonly lifecycle: Pick<LifecyclePort, "onQuit">;
  readonly log: LogPort;
}

/** Milliseconds a write waits for others to land with it. */
export const WRITE_DELAY = 1000;

export class SnapshotStore<T, F = never> {
  readonly #spec: SnapshotSpec<T, F>;
  readonly #ports: SnapshotPorts;
  #pending: { readonly value: T } | undefined;
  #cancel: Unsubscribe | undefined;
  #writing: Promise<void> = Promise.resolve();
  #written: string | undefined;
  #unsubscribe: Unsubscribe | undefined;

  constructor(spec: SnapshotSpec<T, F>, ports: SnapshotPorts) {
    if (spec.migrations.length !== spec.version - 1) {
      throw new Error(
        `${spec.name} is at version ${spec.version} with ${spec.migrations.length} migrations`
      );
    }
    this.#spec = spec;
    this.#ports = ports;
  }

  /** Reads the file, never throwing: whatever cannot be read comes back as the recovered value with the reason. */
  async open(): Promise<Opened<T, F>> {
    this.#unsubscribe ??= this.#ports.lifecycle.onQuit(async () => {
      await this.flush();
    });
    let text: string | undefined;
    try {
      text = await this.#ports.fs.readText(this.#spec.name);
    } catch (error) {
      this.#ports.log.error("Could not read a snapshot file", {
        error,
        file: this.#spec.name,
      });
      return this.#recovered("unreadable");
    }
    if (text === undefined) {
      return this.#recovered("missing");
    }
    this.#written = text;
    return await this.#read(text);
  }

  /** Reads the file again after something else changed it; undefined when it holds what this store last wrote or is about to replace, or cannot be read. */
  async reload(): Promise<Opened<T, F> | undefined> {
    if (this.#pending !== undefined) {
      return undefined;
    }
    let text: string | undefined;
    try {
      text = await this.#ports.fs.readText(this.#spec.name);
    } catch {
      return undefined;
    }
    if (text === undefined || text === this.#written) {
      return undefined;
    }
    this.#written = text;
    const opened = await this.#read(text, false);
    return opened.source === "file" ? opened : undefined;
  }

  /** Writes after the delay, together with any other write in it. */
  write(value: T): void {
    this.#pending = { value };
    this.#cancel ??= this.#ports.clock.schedule(WRITE_DELAY, () => {
      this.#cancel = undefined;
      void this.flush();
    });
  }

  /** Writes what is pending now, and resolves once every write so far is on disk. */
  async flush(): Promise<void> {
    this.#cancel?.();
    this.#cancel = undefined;
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending !== undefined) {
      const text = `${JSON.stringify({ data: pending.value, version: this.#spec.version }, null, 2)}\n`;
      this.#written = text;
      this.#writing = this.#persist(this.#writing, text);
    }
    await this.#writing;
  }

  async #persist(previous: Promise<void>, text: string): Promise<void> {
    await previous;
    try {
      await this.#ports.fs.writeTextAtomic(this.#spec.name, text);
    } catch (error) {
      this.#ports.log.error("Could not write a snapshot file", {
        error,
        file: this.#spec.name,
      });
    }
  }

  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  async #read(text: string, keepCorrupt = true): Promise<Opened<T, F>> {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return await this.#corrupt(text, keepCorrupt);
    }
    const envelope = envelopeSchema.safeParse(json);
    if (!envelope.success) {
      return await this.#corrupt(text, keepCorrupt);
    }
    const { version, data } = envelope.data;
    const migrated = migrate(
      data,
      version,
      this.#spec.version,
      this.#spec.migrations
    );
    if (!migrated.ok) {
      return this.#recovered(
        migrated.error === "newer" ? "newer" : "failedMigration"
      );
    }
    const parsed = this.#spec.schema.safeParse(migrated.value);
    if (parsed.success) {
      return { fallbacks: [], source: "file", value: parsed.data };
    }
    return { ...this.#spec.recover(migrated.value), source: "file" };
  }

  // The next write replaces the file, so what could not be read is kept beside it for the user to recover by hand.
  async #corrupt(text: string, keep: boolean): Promise<Opened<T, F>> {
    if (keep) {
      try {
        await this.#ports.fs.writeTextAtomic(
          `${this.#spec.name}.corrupt`,
          text
        );
      } catch (error) {
        this.#ports.log.error(
          "Could not keep the corrupt copy of a snapshot file",
          {
            error,
            file: this.#spec.name,
          }
        );
      }
    }
    return this.#recovered("corrupt");
  }

  #recovered(source: SnapshotSource): Opened<T, F> {
    return { ...this.#spec.recover(undefined), source };
  }
}

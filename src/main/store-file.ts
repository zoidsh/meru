import path from "node:path";

import { t } from "@lingui/core/macro";

import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { Decoded } from "#core/store-file.ts";
import type { TextFile } from "#platform/text-file.ts";

import { StartupError } from "./failures.ts";

export interface StoreFile<T> {
  file: TextFile;
  /** Names the copy an unreadable file is kept as: `<name>.corrupt-<ms>.json`. */
  name: string;
  decode: (value: unknown) => Decoded<T>;
  encode: (value: T) => unknown;
  /** What the store starts from when it has no file it can read. */
  initial: () => T;
  now: () => number;
  log: Log;
}

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Text that is not JSON decodes as unreadable.
  }
};

/** Replaces the file whole; the caller sends one write at a time. */
export const saveStore = <T>(
  { file, encode }: Pick<StoreFile<T>, "file" | "encode">,
  value: T
) => file.write(`${JSON.stringify(encode(value), undefined, 2)}\n`);

/** A store as read, with the writes reading it owes still to make. */
export interface OpenedStore<T> {
  value: T;
  /** Keeps an unreadable file aside and writes the value the store starts from. */
  settle: () => Promise<void>;
}

const settled = () => Promise.resolve();

/**
 * Reads the store, or starts it from its initial value when there is none,
 * touching nothing on disk until `settle`, so that a second store found newer
 * can still stop startup with neither file changed. A file it cannot read is
 * kept aside rather than overwritten. One a newer Meru wrote stops startup,
 * since writing over it would lose the way back to that version.
 */
export const openStore = async <T>(
  store: StoreFile<T>
): Promise<OpenedStore<T>> => {
  const { file, name, decode, initial, now, log } = store;
  const text = await file.read();
  const parsed = text === undefined ? undefined : parse(text);
  const decoded = text === undefined ? undefined : decode(parsed);

  if (decoded?.kind === "read") {
    return { value: decoded.value, settle: settled };
  }

  if (decoded?.kind === "newer") {
    throw new StartupError(
      t({
        message:
          "This data was saved by a newer version. Open it with that version, or update to it.",
        comment:
          "Shown when the app is started on data that a later version of the app wrote, which this version cannot read",
      })
    );
  }

  const value = initial();

  return {
    value,
    settle: async () => {
      if (decoded) {
        const aside = path.join(
          path.dirname(file.path),
          `${name}.corrupt-${now()}.json`
        );

        await file.moveTo(aside);
        log("store-set-aside", {
          file: scrub.path(file.path),
          kept: scrub.path(aside),
          // Not the decoder's own words, which may quote the file.
          kind: parsed === undefined ? "not-json" : "wrong-shape",
        });
      }

      await saveStore(store, value);
    },
  };
};

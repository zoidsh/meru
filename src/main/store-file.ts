import path from "node:path";

import { t } from "@lingui/core/macro";

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
  log: (message: string) => void;
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

/**
 * Reads the store, or starts it from its initial value when there is none. A
 * file it cannot read is kept aside rather than overwritten. One a newer Meru
 * wrote stops startup with nothing on disk touched, since writing over it would
 * lose the way back to that version.
 */
export const loadStore = async <T>(store: StoreFile<T>): Promise<T> => {
  const { file, name, decode, initial, now, log } = store;
  const text = await file.read();

  if (text !== undefined) {
    const decoded = decode(parse(text));

    if (decoded.kind === "read") {
      return decoded.value;
    }

    if (decoded.kind === "newer") {
      throw new StartupError(
        t({
          message:
            "This data was saved by a newer version. Open it with that version, or update to it.",
          comment:
            "Shown when the app is started on data that a later version of the app wrote, which this version cannot read",
        })
      );
    }

    const aside = path.join(
      path.dirname(file.path),
      `${name}.corrupt-${now()}.json`
    );

    await file.moveTo(aside);
    log(
      `Kept the unreadable ${file.path} as ${aside} and started afresh: ${decoded.reason}`
    );
  }

  const value = initial();

  await saveStore(store, value);

  return value;
};

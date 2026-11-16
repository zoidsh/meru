import path from "node:path";

import { t } from "@lingui/core/macro";

import { createInitialState, decodeState } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TextFile } from "#platform/text-file.ts";

import { StartupError } from "./failures.ts";

export const STATE_FILE_NAME = "state.json";

export interface StateStoreDeps {
  file: TextFile;
  newId: () => string;
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

const serialize = (state: State) => `${JSON.stringify(state, undefined, 2)}\n`;

/**
 * Reads the state, or starts from the initial state when there is none. A
 * file it cannot read is kept aside rather than overwritten. One a newer Meru
 * wrote stops startup with nothing on disk touched, since writing over it would
 * lose the way back to that version.
 */
export const loadState = async ({
  file,
  newId,
  now,
  log,
}: StateStoreDeps): Promise<State> => {
  const text = await file.read();

  if (text !== undefined) {
    const decoded = decodeState(parse(text));

    if (decoded.kind === "state") {
      return decoded.state;
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
      `state.corrupt-${now()}.json`
    );

    await file.moveTo(aside);
    log(
      `Kept the unreadable ${file.path} as ${aside} and started afresh: ${decoded.reason}`
    );
  }

  const state = createInitialState(newId);

  await file.write(serialize(state));

  return state;
};

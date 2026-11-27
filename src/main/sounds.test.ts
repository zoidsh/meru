import { readdir } from "node:fs/promises";
import path from "node:path";

import { delay } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { recordInto } from "#core/log.fake.ts";
import { NOTIFICATION_SOUNDS } from "#core/sounds.ts";
import type { SoundPlayer, SoundResult } from "#platform/sound-player.ts";

import { createSoundOutput, soundFile } from "./sounds.ts";

const FOLDER = path.join("app", "sounds");

/** A player that plays nothing and ends each sound as the test says. */
const fakePlayer = () => {
  const asked: { file: string; volume: number }[] = [];
  const ending: PromiseWithResolvers<SoundResult>[] = [];
  const player: SoundPlayer = {
    play: (file, volume) => {
      const end = Promise.withResolvers<SoundResult>();

      asked.push({ file, volume });
      ending.push(end);

      return end.promise;
    },
  };

  return { player, asked, ending };
};

const setup = ({ background = false } = {}) => {
  const logs: string[] = [];
  const { player, asked, ending } = fakePlayer();
  const output = createSoundOutput({
    player,
    folder: FOLDER,
    background,
    log: recordInto(logs),
  });

  return { output, asked, ending, logs };
};

describe(soundFile, () => {
  it("names a file the build copies for each of Meru's sounds, and the build copies no other", async () => {
    const folder = path.join(import.meta.dirname, "../../resources/sounds");
    const files = await readdir(folder);

    expect(
      NOTIFICATION_SOUNDS.map((sound) =>
        path.basename(soundFile(folder, sound))
      ).toSorted()
    ).toStrictEqual(files.toSorted());
  });
});

describe(createSoundOutput, () => {
  it("plays the sound's file at the volume, returning before it has ended", async () => {
    const { output, asked, ending, logs } = setup();

    output.play({ sound: "duet", volume: 0.5 });

    expect([output.quiet, asked]).toStrictEqual([
      false,
      [{ file: path.join(FOLDER, "duet.wav"), volume: 0.5 }],
    ]);

    ending[0]?.resolve({ end: "played" });
    await delay(0);

    expect(logs).toStrictEqual([]);
  });

  it("logs a sound that failed by its error's code or name alone, never its message, and one cut off by its time limit", async () => {
    const { output, ending, logs } = setup();

    for (let index = 0; index < 6; index += 1) {
      output.play({ sound: "duet", volume: 1 });
    }

    ending[0]?.resolve({
      end: {
        error: Object.assign(new Error("open /Users/ada/x.wav"), {
          code: "ENOENT",
        }),
      },
    });
    ending[1]?.resolve({
      end: {
        error: new DOMException("no device AirPods", "NotFoundError"),
      },
    });
    ending[2]?.resolve({
      end: {
        error: Object.assign(new Error("cpal: AirPods gone"), {
          code: "GenericFailure",
        }),
      },
    });
    ending[3]?.resolve({ end: { error: new TypeError("AirPods") } });
    ending[4]?.resolve({
      end: {
        error: Object.assign(new Error("AirPods"), { name: "AirPodsError" }),
      },
    });
    ending[5]?.resolve({ end: "timedOut" });
    await delay(0);

    expect(logs).toStrictEqual([
      "sound-failed sound=duet error=ENOENT",
      "sound-failed sound=duet error=NotFoundError",
      "sound-failed sound=duet error=GenericFailure",
      "sound-failed sound=duet error=TypeError",
      "sound-failed sound=duet error=other",
      "sound-failed sound=duet error=timed-out",
    ]);
  });

  it("logs an addon that did not load as unavailable, never the library file its message names", async () => {
    const { output, ending, logs } = setup();

    output.play({ sound: "welcome", volume: 1 });
    ending[0]?.resolve({
      end: {
        error: new Error(
          "libpipewire-0.3.so.0: cannot open shared object file: No such file or directory"
        ),
        loading: true,
      },
    });
    await delay(0);

    expect(logs).toStrictEqual([
      "sound-failed sound=welcome error=addon-unavailable",
    ]);
  });

  it("logs a context that did not close once, by its error's name, beside how the sound ended", async () => {
    const { output, ending, logs } = setup();

    output.play({ sound: "nod", volume: 1 });
    output.play({ sound: "sip", volume: 1 });
    ending[0]?.resolve({
      end: "played",
      closeError: new DOMException("AirPods", "InvalidStateError"),
    });
    ending[1]?.resolve({ end: "timedOut", closeError: "AirPods" });
    await delay(0);

    expect(logs).toStrictEqual([
      "sound-failed sound=nod stage=close error=InvalidStateError",
      "sound-failed sound=sip error=timed-out",
      "sound-failed sound=sip stage=close error=other",
    ]);
  });

  it("under the background flag plays nothing, logs the sound, and keeps notifications silent", () => {
    const { output, asked, logs } = setup({ background: true });

    output.play({ sound: "duet", volume: 1 });

    expect([output.quiet, asked, logs]).toStrictEqual([
      true,
      [],
      ["sound-held sound=duet reason=background"],
    ]);
  });
});

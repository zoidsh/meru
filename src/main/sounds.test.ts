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

    ending[0]?.resolve("played");
    await delay(0);

    expect(logs).toStrictEqual([]);
  });

  it("logs a sound that failed by its code alone, and one cut off by its time limit", async () => {
    const { output, ending, logs } = setup();

    output.play({ sound: "duet", volume: 1 });
    output.play({ sound: "knock", volume: 1 });
    output.play({ sound: "duet", volume: 1 });
    ending[0]?.resolve({
      error: Object.assign(new Error("open /Users/ada/x.wav"), {
        code: "ENOENT",
      }),
    });
    ending[1]?.resolve({ error: new Error("DeviceNotAvailable: AirPods") });
    ending[2]?.resolve("timedOut");
    await delay(0);

    expect(logs).toStrictEqual([
      "sound-failed sound=duet code=ENOENT",
      "sound-failed sound=knock code=other",
      "sound-failed sound=duet reason=timed-out",
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

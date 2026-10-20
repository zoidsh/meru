const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const HOME = os.homedir();
const RESOURCES = process.resourcesPath;
const USER_SOUNDS = path.join(HOME, "Library", "Sounds");
const USER_SOUND_FILE = path.join(USER_SOUNDS, "MeruProbe.wav");

module.exports = {
  title: "macOS notification sound probe",
  sounds: "chirp / system default / submarine / other",

  phases: {
    off: "No Focus active",
    focus: "A Focus is active, Meru Probe NOT on its allow list",
    allowlist: "A Focus is active, Meru Probe ON its allow list",
  },

  osVersion: async (run) => `${await run("sw_vers", ["-productVersion"])} (darwin ${os.release()})`,

  async signing(run) {
    // codesign reports on stderr even on success, so stdout alone is always empty.
    const bundle = app.getAppPath().replace(/\/Contents\/.*$/, "");
    const output = await run("sh", ["-c", `codesign -dv --verbose=2 '${bundle}' 2>&1`]);
    const lines = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return (
      lines.find((line) => line.startsWith("Authority=")) ??
      lines.find((line) => line.startsWith("Signature=")) ??
      lines.join(" | ")
    );
  },

  async signals(run) {
    const started = Date.now();
    const controlCenter = await run("defaults", [
      "read",
      "com.apple.controlcenter",
      "NSStatusItem Visible FocusModes",
    ]);
    const elapsed = Date.now() - started;

    const signals = [[`controlcenter FocusModes (${elapsed}ms)`, controlCenter]];

    for (const name of ["Assertions.json", "ModeConfigurations.json"]) {
      const file = path.join(HOME, "Library", "DoNotDisturb", "DB", name);
      try {
        const raw = fs.readFileSync(file, "utf8");
        let detail = `readable, ${raw.length} bytes`;
        if (name === "Assertions.json") {
          const records = JSON.parse(raw)?.data?.[0]?.storeAssertionRecords;
          detail += records?.length
            ? `, mode ${records[0].assertionDetails?.assertionDetailsModeIdentifier ?? "(none)"}`
            : ", no active assertion";
        }
        signals.push([name, detail]);
      } catch (error) {
        signals.push([name, `${error.code ?? "ERR"}: ${error.message}`]);
      }
    }

    return signals;
  },

  async setup(ask) {
    const source = path.join(RESOURCES, "chirp.wav");
    if (!fs.existsSync(source)) {
      return { userSoundInstalled: false };
    }

    const answer = (await ask(`Copy a probe sound to ${USER_SOUND_FILE}? [y/N] `)).toLowerCase();
    if (answer !== "y") {
      return { userSoundInstalled: false };
    }

    fs.mkdirSync(USER_SOUNDS, { recursive: true });
    fs.copyFileSync(source, USER_SOUND_FILE);
    console.log("  copied. It is removed again at the end of this run.\n");

    return { userSoundInstalled: true };
  },

  teardown({ userSoundInstalled }) {
    if (userSoundInstalled) {
      fs.rmSync(USER_SOUND_FILE, { force: true });
      console.log(`\nRemoved ${USER_SOUND_FILE}`);
    }
  },

  cases: [
    { label: "no silent, no sound", options: {} },
    { label: "silent: false", options: { silent: false } },
    { label: "silent: true  (what Meru ships today)", options: { silent: true } },
    {
      label: 'sound: "Submarine"  (name in /System/Library/Sounds)',
      options: { silent: false, sound: "Submarine" },
    },
    {
      label: 'sound: "chirp"  (Contents/Resources/chirp.wav, no extension)',
      options: { silent: false, sound: "chirp" },
    },
    {
      label: 'sound: "chirp.wav"  (Contents/Resources/chirp.wav)',
      options: { silent: false, sound: "chirp.wav" },
    },
    {
      label: 'sound: "sounds/chirp.wav"  (a subdirectory of Resources)',
      options: { silent: false, sound: "sounds/chirp.wav" },
    },
    {
      label: "sound: <absolute path into Resources>",
      options: { silent: false, sound: path.join(RESOURCES, "chirp.wav") },
    },
    {
      label: 'sound: "MeruProbe"  (~/Library/Sounds/MeruProbe.wav)',
      options: { silent: false, sound: "MeruProbe" },
      skip: ({ userSoundInstalled }) => !userSoundInstalled,
    },
  ],
};

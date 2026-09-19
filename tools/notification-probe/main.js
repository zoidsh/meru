const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { promisify } = require("node:util");
const { Notification, app } = require("electron");

const execFileAsync = promisify(execFile);

const HOME = os.homedir();
const RESOURCES = process.resourcesPath;
const USER_SOUNDS = path.join(HOME, "Library", "Sounds");
const USER_SOUND_FILE = path.join(USER_SOUNDS, "MeruProbe.wav");

const PHASES = {
  off: "No Focus active",
  focus: "A Focus is active, Meru Probe NOT on its allow list",
  allowlist: "A Focus is active, Meru Probe ON its allow list",
};

const CASES = [
  { id: "bare", label: "no silent, no sound", options: {} },
  { id: "silent-false", label: "silent: false", options: { silent: false } },
  { id: "silent-true", label: "silent: true  (what Meru ships today)", options: { silent: true } },
  {
    id: "system-name",
    label: 'sound: "Submarine"  (name in /System/Library/Sounds)',
    options: { silent: false, sound: "Submarine" },
  },
  {
    id: "bundled-noext",
    label: 'sound: "chirp"  (Contents/Resources/chirp.wav, no extension)',
    options: { silent: false, sound: "chirp" },
  },
  {
    id: "bundled-ext",
    label: 'sound: "chirp.wav"  (Contents/Resources/chirp.wav)',
    options: { silent: false, sound: "chirp.wav" },
  },
  {
    id: "bundled-subpath",
    label: 'sound: "sounds/chirp.wav"  (a subdirectory of Resources)',
    options: { silent: false, sound: "sounds/chirp.wav" },
  },
  {
    id: "absolute",
    label: "sound: <absolute path into Resources>",
    options: () => ({ silent: false, sound: path.join(RESOURCES, "chirp.wav") }),
  },
  {
    id: "user-sounds",
    label: 'sound: "MeruProbe"  (~/Library/Sounds/MeruProbe.wav)',
    options: { silent: false, sound: "MeruProbe" },
    needsUserSound: true,
  },
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

async function run(file, args) {
  try {
    const { stdout } = await execFileAsync(file, args, { timeout: 5000 });
    return stdout.trim();
  } catch (error) {
    return `ERR ${error.code ?? ""} ${(error.stderr || error.message).trim()}`.trim();
  }
}

async function readFocusSignals() {
  const started = Date.now();
  const controlCenter = await run("defaults", [
    "read",
    "com.apple.controlcenter",
    "NSStatusItem Visible FocusModes",
  ]);
  const defaultsMs = Date.now() - started;

  const signals = { controlCenter, defaultsMs };

  for (const name of ["Assertions.json", "ModeConfigurations.json"]) {
    const file = path.join(HOME, "Library", "DoNotDisturb", "DB", name);
    try {
      const raw = fs.readFileSync(file, "utf8");
      signals[name] = `readable, ${raw.length} bytes`;
      if (name === "Assertions.json") {
        const records = JSON.parse(raw)?.data?.[0]?.storeAssertionRecords;
        signals.assertionMode = records?.length
          ? (records[0].assertionDetails?.assertionDetailsModeIdentifier ?? "(record, no mode id)")
          : "(no active assertion)";
      }
    } catch (error) {
      signals[name] = `${error.code ?? "ERR"}: ${error.message}`;
    }
  }

  return signals;
}

function printSignals(signals) {
  console.log("  Focus signals:");
  console.log(
    `    controlcenter "NSStatusItem Visible FocusModes": ${signals.controlCenter}  (${signals.defaultsMs}ms)`,
  );
  console.log(`    Assertions.json:         ${signals["Assertions.json"]}`);
  console.log(`    Assertions active mode:  ${signals.assertionMode ?? "n/a"}`);
  console.log(`    ModeConfigurations.json: ${signals["ModeConfigurations.json"]}`);
}

function fire(options) {
  return new Promise((resolve) => {
    const events = [];
    const notification = new Notification({
      title: "Meru notification probe",
      body: options.sound ? `sound: ${options.sound}` : "no sound option",
      ...options,
    });

    notification.on("show", () => events.push("show"));
    notification.on("failed", (_event, error) => events.push(`failed(${error})`));
    notification.on("close", () => events.push("close"));

    notification.show();
    setTimeout(() => resolve(events), 2500);
  });
}

async function signingStatus() {
  const out = await run("codesign", [
    "-dv",
    "--verbose=2",
    app.getAppPath().replace(/\/Contents\/.*$/, ""),
  ]);
  const authority = out.split("\n").find((line) => line.startsWith("Authority="));
  return authority ?? out.split("\n")[0] ?? "unknown";
}

async function main() {
  await app.whenReady();

  console.log("\nMeru macOS notification sound probe");
  console.log("===================================\n");
  console.log(`  Electron:        ${process.versions.electron}`);
  console.log(
    `  macOS:           ${await run("sw_vers", ["-productVersion"])} (darwin ${os.release()})`,
  );
  console.log(`  Bundle id:       ${app.getName()}`);
  console.log(`  Resources:       ${RESOURCES}`);
  console.log(`  Packaged:        ${app.isPackaged}`);
  console.log(`  Signing:         ${await signingStatus()}`);
  console.log(`  Notification.isSupported: ${Notification.isSupported()}\n`);

  if (!app.isPackaged) {
    console.log("  WARNING: not packaged. The `sound` option is reported not to work unpackaged,");
    console.log("  so a negative result here proves nothing. Build and run the .app instead.\n");
  }

  console.log("Which phase is this run?\n");
  for (const [key, description] of Object.entries(PHASES)) {
    console.log(`  ${key.padEnd(10)} ${description}`);
  }
  let phase = await ask("\nPhase: ");
  if (!PHASES[phase]) {phase = "off";}
  console.log(`\n-> ${PHASES[phase]}\n`);

  let userSoundInstalled = false;
  const source = path.join(RESOURCES, "chirp.wav");
  if (fs.existsSync(source)) {
    const wantUserSound = (
      await ask(`Copy a probe sound to ${USER_SOUND_FILE}? [y/N] `)
    ).toLowerCase();
    if (wantUserSound === "y") {
      fs.mkdirSync(USER_SOUNDS, { recursive: true });
      fs.copyFileSync(source, USER_SOUND_FILE);
      userSoundInstalled = true;
      console.log("  copied. It is removed again at the end of this run.\n");
    }
  }

  const results = [];

  for (const [index, testCase] of CASES.entries()) {
    if (testCase.needsUserSound && !userSoundInstalled) {
      results.push({ ...testCase, heard: "skipped", events: [] });
      continue;
    }

    const options = typeof testCase.options === "function" ? testCase.options() : testCase.options;

    console.log(`\n[${index + 1}/${CASES.length}] ${testCase.label}`);
    console.log(`  options: ${JSON.stringify(options)}`);
    printSignals(await readFocusSignals());

    await ask("  press Enter to fire...");
    const events = await fire(options);
    console.log(`  events: ${events.join(", ") || "(none)"}`);

    let heard = "";
    while (!["y", "n", "s"].includes(heard)) {
      heard = (await ask("  did you HEAR a sound? [y/n/s=skip] ")).toLowerCase();
    }

    let which = "";
    if (heard === "y") {
      which = await ask("  which sound? [chirp / system default / submarine / other] ");
    }

    results.push({ ...testCase, options, events, heard, which });
  }

  if (userSoundInstalled) {
    fs.rmSync(USER_SOUND_FILE, { force: true });
    console.log(`\nRemoved ${USER_SOUND_FILE}`);
  }

  console.log(`\n\n## Results — ${PHASES[phase]}\n`);
  console.log(
    `Electron ${process.versions.electron}, darwin ${os.release()}, packaged=${app.isPackaged}\n`,
  );
  console.log("| Case | Options | Heard | Which | Events |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const result of results) {
    const options = result.options ? JSON.stringify(result.options).replace(/\|/g, "\\|") : "";
    console.log(
      `| ${result.label} | \`${options}\` | ${result.heard} | ${result.which || ""} | ${result.events.join(", ")} |`,
    );
  }

  console.log("\nFinal Focus signals:");
  printSignals(await readFocusSignals());

  rl.close();
  app.quit();
}

main();

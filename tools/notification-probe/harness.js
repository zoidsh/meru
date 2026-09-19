const { execFile } = require("node:child_process");
const os = require("node:os");
const readline = require("node:readline");
const { promisify } = require("node:util");
const { Notification, app } = require("electron");

const execFileAsync = promisify(execFile);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = (question) => new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));

async function run(file, args) {
  try {
    const { stdout } = await execFileAsync(file, args, { timeout: 15000 });
    return stdout.trim();
  } catch (error) {
    return `ERR ${error.code ?? ""} ${(error.stderr || error.message).trim()}`.trim();
  }
}

function fire(options) {
  return new Promise((resolve) => {
    const events = [];
    const notification = new Notification({
      title: "Meru notification probe",
      body: "probe",
      ...options,
    });

    notification.on("show", () => events.push("show"));
    notification.on("failed", (_event, error) => events.push(`failed(${error})`));
    notification.on("close", () => events.push("close"));

    notification.show();
    setTimeout(() => resolve(events), 2500);
  });
}

async function signingStatus(probe) {
  const report = await probe.signing(run);
  return report || "unknown";
}

async function printSignals(probe) {
  const signals = await probe.signals(run);
  console.log("  Signals:");
  for (const [label, value] of signals) {
    console.log(`    ${label.padEnd(34)} ${value}`);
  }
}

async function main(probe) {
  await app.whenReady();

  if (probe.beforeReady) {
    await probe.beforeReady();
  }

  console.log(`\nMeru ${probe.title}`);
  console.log("=".repeat(probe.title.length + 5));
  console.log();
  console.log(`  Electron:        ${process.versions.electron}`);
  console.log(`  OS:              ${await probe.osVersion(run)}`);
  console.log(`  App id:          ${app.getName()}`);
  console.log(`  Resources:       ${process.resourcesPath}`);
  console.log(`  Packaged:        ${app.isPackaged}`);
  console.log(`  Signing:         ${await signingStatus(probe)}`);
  console.log(`  Notification.isSupported: ${Notification.isSupported()}\n`);

  if (!app.isPackaged) {
    console.log("  WARNING: not packaged. Sound delivery differs for an unpackaged build,");
    console.log("  so a negative result here proves nothing. Build and run the app instead.\n");
  }

  console.log("Which phase is this run?\n");
  for (const [key, description] of Object.entries(probe.phases)) {
    console.log(`  ${key.padEnd(10)} ${description}`);
  }

  let phase = await ask("\nPhase: ");
  if (!probe.phases[phase]) {
    [phase] = Object.keys(probe.phases);
  }
  console.log(`\n-> ${probe.phases[phase]}\n`);

  const setup = probe.setup ? await probe.setup(ask) : {};
  const results = [];
  const cases = probe.cases.filter((testCase) => !testCase.skip || !testCase.skip(setup));

  for (const [index, testCase] of cases.entries()) {
    const options =
      typeof testCase.options === "function" ? testCase.options(setup) : testCase.options;

    console.log(`\n[${index + 1}/${cases.length}] ${testCase.label}`);
    console.log(`  options: ${JSON.stringify(options).slice(0, 300)}`);
    await printSignals(probe);

    await ask("  press Enter to fire...");
    const events = await fire(options);
    console.log(`  events: ${events.join(", ") || "(none)"}`);

    let heard = "";
    while (!["y", "n", "s"].includes(heard)) {
      heard = (await ask("  did you HEAR a sound? [y/n/s=skip] ")).toLowerCase();
    }

    const which = heard === "y" ? await ask(`  which sound? [${probe.sounds}] `) : "";

    results.push({ label: testCase.label, heard, which, events });
  }

  if (probe.teardown) {
    await probe.teardown(setup);
  }

  console.log(`\n\n## Results — ${probe.phases[phase]}\n`);
  console.log(
    `Electron ${process.versions.electron}, ${os.platform()} ${os.release()}, packaged=${app.isPackaged}\n`,
  );
  console.log("| Case | Heard | Which | Events |");
  console.log("| --- | --- | --- | --- |");
  for (const result of results) {
    console.log(
      `| ${result.label} | ${result.heard} | ${result.which || ""} | ${result.events.join(", ")} |`,
    );
  }

  console.log("\nFinal signals:");
  await printSignals(probe);

  rl.close();
  app.quit();
}

module.exports = { main, run, ask };

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Notification, app, shell } = require("electron");

const GAP_MS = 5000;

function fire(options, label) {
  return new Promise((resolve) => {
    const events = [];
    const notification = new Notification({
      title: `Probe ${label}`,
      body: "listen now",
      ...options,
    });

    notification.on("show", () => events.push("show"));
    notification.on("failed", (_event, error) => events.push(`failed(${error})`));

    notification.show();
    setTimeout(() => resolve(events), GAP_MS);
  });
}

/*
 * Windows builds Electron as a GUI-subsystem binary, so a packaged app has no
 * console to print to and no stdin to read answers from. The run is therefore
 * unattended: each notification names its own case so the tester can match what
 * they heard against the report afterwards, in the Action Center if need be.
 */
async function runUnattended(probe, run) {
  await app.whenReady();

  const phase = (process.argv.find((arg) => arg.startsWith("--phase=")) ?? "").split("=")[1];
  const phaseKey = probe.phases[phase] ? phase : Object.keys(probe.phases)[0];

  const lines = [];
  const say = (line = "") => lines.push(line);

  say(`## Results — ${probe.phases[phaseKey]}`);
  say();
  say(`- Electron ${process.versions.electron}`);
  say(`- ${os.platform()} ${os.release()} — ${await probe.osVersion(run)}`);
  say(`- packaged: ${app.isPackaged}`);
  say(`- signing: ${await probe.signing(run)}`);
  say(`- Notification.isSupported: ${Notification.isSupported()}`);
  say();

  say("### Signals before the run");
  say();
  for (const [label, value] of await probe.signals(run)) {
    say(`- \`${label}\`: ${value}`);
  }
  say();

  say("### Cases");
  say();
  say("Each notification is titled with its case number. Fill in Heard and Which.");
  say();
  say(
    "**Which matters more than Heard.** An unsupported sound source does not fall silent, it plays a substitute, so a case that makes noise has not necessarily played our own file. Case 1 is the platform default; the chirp is a rising tone over about half a second.",
  );
  say();
  say("| # | Case | Heard | Which: chirp / same as case 1 / other | Events |");
  say("| --- | --- | --- | --- | --- |");

  for (const [index, testCase] of probe.cases.entries()) {
    const number = `${index + 1}/${probe.cases.length}`;
    const options =
      typeof testCase.options === "function" ? testCase.options({}) : testCase.options;
    const events = await fire(options, `${number} ${testCase.label}`);
    say(`| ${index + 1} | ${testCase.label} | | | ${events.join(", ") || "(none)"} |`);
  }

  say();
  say("### Signals after the run");
  say();
  for (const [label, value] of await probe.signals(run)) {
    say(`- \`${label}\`: ${value}`);
  }
  say();

  const report = path.join(os.homedir(), `meru-probe-${phaseKey}.md`);
  fs.writeFileSync(report, `${lines.join("\n")}\n`, "utf8");
  shell.showItemInFolder(report);

  app.quit();
}

module.exports = { runUnattended };

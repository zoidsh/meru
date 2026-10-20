const { execFile } = require("node:child_process");
const path = require("node:path");
const { Notification, app } = require("electron");

/*
 * One notification per process, so the notification daemons can be restarted
 * between cases. The label goes in the title so a case can be found in the
 * unified log and in Notification Center afterwards.
 */
async function fireCase({ label, sound, meruShape, silent, selfPlay }) {
  await app.whenReady();

  console.log(`PROBE app=${app.getAppPath()} resources=${process.resourcesPath}`);
  console.log(
    `PROBE case=${label} sound=${JSON.stringify(sound)} meruShape=${meruShape} silent=${silent}`,
  );

  const notification = new Notification({
    title: `Probe ${label}`,
    body: `sound: ${sound ?? "(none)"}`,
    ...(meruShape
      ? {
          subtitle: "Your test notification request",
          actions: [
            { text: "Archive", type: "button" },
            { text: "Mark as read", type: "button" },
          ],
        }
      : {}),
    silent,
    ...(sound ? { sound } : {}),
  });

  notification.on("show", () => {
    console.log(`PROBE ${new Date().toISOString()} event: show`);

    if (selfPlay) {
      const file = path.join(process.resourcesPath, `${selfPlay}.wav`);
      console.log(`PROBE ${new Date().toISOString()} self-play start ${file}`);
      execFile("/usr/bin/afplay", [file], (error) =>
        console.log(
          `PROBE ${new Date().toISOString()} self-play end ${error ? `error ${error.message}` : "ok"}`,
        ),
      );
    }
  });
  notification.on("failed", (_event, error) =>
    console.log(`PROBE ${new Date().toISOString()} event: failed(${error})`),
  );

  console.log(`PROBE ${new Date().toISOString()} posting`);
  notification.show();

  setTimeout(() => app.quit(), 6000);
}

function readCaseArgs(argv) {
  const value = (name) => {
    const arg = argv.find((entry) => entry.startsWith(`--${name}=`));
    return arg === undefined ? undefined : arg.slice(name.length + 3);
  };

  const label = value("case");

  if (label === undefined) {
    return null;
  }

  return {
    label,
    sound: value("case-sound") || null,
    meruShape: argv.includes("--meru-shape"),
    silent: argv.includes("--silent"),
    selfPlay: value("self-play") || null,
  };
}

module.exports = { fireCase, readCaseArgs };

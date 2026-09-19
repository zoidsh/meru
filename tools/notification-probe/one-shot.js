const fs = require("node:fs");
const path = require("node:path");
const { Notification, app } = require("electron");

/*
 * Fires one notification with a chosen sound name, so a file that fails in a
 * real app can be dropped into this bundle's Resources and tried in isolation.
 * macOS substitutes an unrelated system sound for a name it cannot resolve, so
 * "wrong sound" and "no sound" are different failures and worth telling apart.
 */
async function fireOne(name) {
  await app.whenReady();

  const resources = process.resourcesPath;
  const present = fs.readdirSync(resources).filter((entry) => /\.(wav|aiff?|caf)$/i.test(entry));

  console.log(`\nResources: ${resources}`);
  console.log(`Sound files there: ${present.join(", ") || "(none)"}`);
  console.log(`Firing with sound: ${JSON.stringify(name)}\n`);

  const match = present.find((entry) => path.parse(entry).name === name);
  console.log(match ? `  matches ${match}` : "  NO FILE of that name in Resources");

  const notification = new Notification({
    title: "Meru probe",
    body: `sound: ${name}`,
    silent: false,
    sound: name,
  });

  notification.on("show", () => console.log("  event: show"));
  notification.on("failed", (_event, error) => console.log(`  event: failed(${error})`));

  notification.show();

  setTimeout(() => {
    console.log("\nDid you hear that file, or a different system sound?");
    app.quit();
  }, 3000);
}

module.exports = { fireOne };

const { main, run } = require("./harness");
const { runUnattended } = require("./unattended");
const { fireOne } = require("./one-shot");

const probes = {
  darwin: () => require("./macos"),
  win32: () => require("./windows"),
};

const load = probes[process.platform];

if (!load) {
  console.error(`No probe for ${process.platform}. This runs on macOS and Windows.`);
  process.exit(1);
}

const probe = load();

const oneShot = process.argv.find((arg) => arg.startsWith("--sound="));

if (oneShot) {
  fireOne(oneShot.slice("--sound=".length));
} else if (probe.unattended) {
  runUnattended(probe, run);
} else {
  main(probe);
}

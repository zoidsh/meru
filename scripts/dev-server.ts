/*
 * Builds the app and serves the renderer, without starting Electron.
 *
 * `bun run dev` starts Electron itself, and `_electron.launch` has to spawn the
 * app to attach to it, so the two cannot both drive it. This is what the boot
 * test's `webServer` runs instead: it also keeps the build pipeline in a Bun
 * process, which the test itself cannot be, because Playwright runs test files
 * under Node.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { ms } from "@meru/shared/ms";
import { buildAppFiles, resetBuildDirectory, startRendererDevServer } from "./build";

const BIND_TIMEOUT = ms("30s");
const BIND_RETRY_INTERVAL = ms("0.5s");

/**
 * The port is fixed rather than negotiated, so back-to-back runs can arrive
 * while the previous run's server is still letting go of it. Retrying for a
 * few seconds covers that window; anything longer is someone else's server and
 * worth failing over.
 */
async function listenOnPort(port: number, cacheDir: string) {
  const deadline = Date.now() + BIND_TIMEOUT;

  while (true) {
    try {
      return await startRendererDevServer("renderer", port, { strictPort: true, cacheDir });
    } catch (error) {
      // Vite rejects with a plain Error carrying no `code`, so the message is
      // the only thing that distinguishes a taken port from a real fault.
      const isPortTaken = error instanceof Error && error.message.includes("is already in use");

      if (!isPortTaken || Date.now() >= deadline) {
        throw error;
      }

      await Bun.sleep(BIND_RETRY_INTERVAL);
    }
  }
}

const args = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

const port = Number(args.values.port);

if (!Number.isInteger(port)) {
  throw new Error("--port is required, and must be a whole number.");
}

/*
 * A dependency cache of its own, rather than the `node_modules/.vite` that
 * every server would otherwise share. A run starting seconds after the last one
 * overlaps that one's shutdown, and two optimizers over a single cache
 * directory deadlock: the new server never finishes listening and never errors
 * either, so whoever is waiting on its URL waits for the full timeout.
 */
const cacheDir = await mkdtemp(path.join(tmpdir(), "meru-renderer-cache-"));

const cleanUpAndExit = async () => {
  await rm(cacheDir, { recursive: true, force: true });

  process.exit(0);
};

process.on("SIGTERM", cleanUpAndExit);
process.on("SIGINT", cleanUpAndExit);

await resetBuildDirectory();

await Promise.all([buildAppFiles({ dev: true }), listenOnPort(port, cacheDir)]);

console.log(`Renderer dev server listening on http://127.0.0.1:${port}/`);

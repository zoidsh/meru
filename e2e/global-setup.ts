import { existsSync } from "node:fs";
import path from "node:path";

import { extractFile } from "@electron/asar";

import { E2E_MARKER } from "../electron-builder.config.ts";
import { executablePath } from "./lib/app.ts";

const appArchive = () =>
  process.platform === "darwin"
    ? path.resolve(executablePath, "..", "..", "Resources", "app.asar")
    : path.join(path.dirname(executablePath), "resources", "app.asar");

/**
 * Any other build ignores the suite's switches: it waits for a debugger that
 * never attaches, and it may come to the front. So the packed manifest is
 * checked before anything is launched.
 */
const globalSetup = () => {
  const archive = appArchive();

  if (!existsSync(executablePath) || !existsSync(archive)) {
    throw new Error(
      `No packed app at ${executablePath}; run \`pnpm test:e2e\` without MERU_SKIP_BUILD, or point MERU_EXECUTABLE at one.`
    );
  }

  const manifest = JSON.parse(
    extractFile(archive, "package.json").toString("utf-8")
  ) as Record<string, unknown>;

  for (const [key, value] of Object.entries(E2E_MARKER)) {
    if (manifest[key] !== value) {
      throw new Error(
        `${executablePath} is not the end-to-end build; pack it with \`pnpm package --e2e\` or let \`pnpm test:e2e\` do it.`
      );
    }
  }
};

export default globalSetup;

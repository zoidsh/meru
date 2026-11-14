// Writes the Gmail fixtures the preload's tests read, from a signed-in profile, each document scrubbed of everything personal:
// MERU_TEST_PROFILE_DIR=<a user data directory signed in to Gmail> node scripts/gmail/capture.ts, after pnpm build.
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect } from "@playwright/test";
import type { ElectronApplication } from "@playwright/test";

import { scrubHtml } from "../../app/core/engines/scrub.ts";
import { launch } from "../lib/app.ts";

const root = path.join(import.meta.dirname, "..", "..");
const FIXTURES = path.join(root, "app/preload/gmail/fixtures/captured");

/** How long a document of the real Gmail is given to render. */
const READY = 120_000;

/** Runs `code` in the pane's page, which answers a string, and gives back what it answered. */
const readPane = async (
  app: ElectronApplication,
  contentsId: number,
  code: string
): Promise<string> =>
  await app.evaluate(
    async ({ webContents }, request) => {
      const contents = webContents.fromId(request.contentsId);
      if (contents === undefined) {
        throw new Error(`No web contents ${request.contentsId}`);
      }
      // executeJavaScript answers whatever the page's last expression gave, so every script here ends in a string.
      const answer: unknown = await contents.executeJavaScript(
        request.code,
        true
      );
      return typeof answer === "string" ? answer : "";
    },
    { code, contentsId }
  );

const quote = (text: string) => JSON.stringify(text);

const found = (selector: string) =>
  `document.querySelector(${quote(selector)}) === null ? "" : "ready"`;

const waitFor = async (
  app: ElectronApplication,
  contentsId: number,
  selector: string,
  what: string
) => {
  await expect
    .poll(async () => await readPane(app, contentsId, found(selector)), {
      message: `${what} never rendered`,
      timeout: READY,
    })
    .toBe("ready");
};

const goTo = async (
  app: ElectronApplication,
  contentsId: number,
  hash: string
) => {
  await readPane(
    app,
    contentsId,
    `(() => { location.hash = ${quote(hash)}; return "went"; })()`
  );
};

/** The web contents of the first pane, which shows the profile's Gmail tab, once it has one. */
const gmailPane = async (app: ElectronApplication): Promise<number> => {
  const idOf = async () =>
    await app.evaluate(
      ({ webContents }) =>
        webContents
          .getAllWebContents()
          .find((contents) => contents.getURL().includes("mail.google.com"))
          ?.id ?? 0
    );
  await expect
    .poll(idOf, { message: "No pane showed Gmail", timeout: READY })
    .toBeGreaterThan(0);
  return await idOf();
};

const write = async (name: string, html: string) => {
  const day = new Date().toISOString().slice(0, 10);
  const header = `<!-- Captured by scripts/gmail/capture.ts and scrubbed by app/core/engines/scrub.ts on ${day}. -->\n`;
  const file = path.join(FIXTURES, name);
  await writeFile(file, `${header}${scrubHtml(html)}\n`);
  return path.relative(root, file);
};

const documentOf = async (app: ElectronApplication, contentsId: number) =>
  await readPane(app, contentsId, "document.documentElement.outerHTML");

/** The id of the first thread the list shows, by which the thread's own document is opened. */
const firstThread = async (app: ElectronApplication, contentsId: number) => {
  const id = await readPane(
    app,
    contentsId,
    '(() => { const row = document.querySelector("[data-legacy-thread-id]"); return row === null ? "" : row.getAttribute("data-legacy-thread-id") ?? ""; })()'
  );
  if (id === "") {
    throw new Error("The list showed no thread to open");
  }
  return id;
};

const capture = async (app: ElectronApplication) => {
  const pane = await gmailPane(app);
  await waitFor(app, pane, '[role="main"]', "Gmail's inbox");
  const written = [await write("inbox.html", await documentOf(app, pane))];

  await goTo(app, pane, `inbox/${await firstThread(app, pane)}`);
  await waitFor(app, pane, "h2[data-legacy-thread-id]", "The thread");
  written.push(await write("thread.html", await documentOf(app, pane)));

  await goTo(app, pane, "inbox");
  await waitFor(app, pane, '[role="main"]', "Gmail's inbox");
  await goTo(app, pane, "inbox?compose=new");
  await waitFor(
    app,
    pane,
    '[role="dialog"] [role="textbox"], [role="dialog"] textarea[name="to"], [role="dialog"] input[name="subjectbox"]',
    "The compose box"
  );
  written.push(await write("compose.html", await documentOf(app, pane)));
  return written;
};

const run = async () => {
  const profile = process.env.MERU_TEST_PROFILE_DIR;
  if (profile === undefined || profile === "") {
    throw new Error(
      "MERU_TEST_PROFILE_DIR names the user data directory signed in to Gmail: MERU_TEST_PROFILE_DIR=<dir> node scripts/gmail/capture.ts"
    );
  }
  if (!existsSync(path.join(root, "app/dist/main/index.js"))) {
    throw new Error(
      "Nothing to capture from in app/dist/; run pnpm build first"
    );
  }
  await mkdir(FIXTURES, { recursive: true });
  // The app is launched on a copy, so a capture never writes to the signed-in profile it reads.
  const userData = await mkdtemp(path.join(tmpdir(), "meru-capture-"));
  await cp(profile, userData, { recursive: true });
  // MERU_E2E blanks every pane, so the capture turns off what the end-to-end launch sets.
  const { app, close } = await launch({ env: { MERU_E2E: "0" }, userData });
  try {
    for (const file of await capture(app)) {
      console.log(`Wrote ${file}`);
    }
  } finally {
    await close();
    await rm(userData, { force: true, recursive: true });
  }
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

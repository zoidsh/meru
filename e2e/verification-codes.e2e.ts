import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { expect, findPage, test } from "./lib/app.ts";
import type { StandInMail } from "./lib/stand-in.ts";

/** A session with no account cookie, which the profile here is. */
const ANY_SESSION = "";

const CODE = "493021";

const plain: StandInMail = {
  id: "1",
  subject: "Lunch",
  summary: "Are we still on?",
  senderName: "Ada",
  senderAddress: "ada@example.com",
};

const withCode: StandInMail = {
  id: "2",
  subject: "Your verification code",
  summary: `Use ${CODE} to finish signing in`,
  senderName: "Example",
  senderAddress: "no-reply@example.com",
};

interface Captured {
  title: string;
  body: string;
  shown: boolean;
  actions?: string[];
  act: (index: number) => void;
}

const captured = (app: ElectronApplication) =>
  app.evaluate(() =>
    (Reflect.get(globalThis, "meruTestNotifications") as Captured[]).map(
      ({ title, body, shown, actions }) => ({ title, body, shown, actions })
    )
  );

/** What the suite's build would have written to the clipboard, in order. */
const copied = (app: ElectronApplication) =>
  app.evaluate(() => [
    ...((Reflect.get(globalThis, "meruTestClipboard") as
      | string[]
      | undefined) ?? []),
  ]);

const writeStores = async (
  userDataDir: string,
  { settings = {}, state = {} }: { settings?: object; state?: object }
) => {
  await writeFile(
    path.join(userDataDir, "state.json"),
    JSON.stringify({
      version: 1,
      profiles: [{ id: "p0", name: "Home" }],
      selectedProfileId: "p0",
      ...state,
    })
  );
  await writeFile(
    path.join(userDataDir, "settings.json"),
    JSON.stringify({ version: 1, ...settings })
  );
};

/** What Gmail's tab would do as mail comes: change its title, a poke. */
const retitle = (page: Page, title: string) =>
  page.evaluate((next) => {
    document.title = next;
  }, title);

const unread = (shell: Page) =>
  shell
    .getByRole("tablist", { name: "Profiles" })
    .getByRole("tab", { name: /^Home/u });

test("shows a code with a Copy button, copies nothing until it is pressed, then copies the digits and marks the mail read", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeStores(userDataDir, {
    settings: { verificationCodeMarkRead: true },
  });
  standIn.setFeed(ANY_SESSION, { unreadCount: 1, mail: [plain] });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const gmail = await findPage(app, standIn.url);

  await expect(unread(shell)).toHaveAccessibleName("Home, 1 unread message");

  standIn.setFeed(ANY_SESSION, { unreadCount: 2, mail: [withCode, plain] });
  await retitle(gmail, "Inbox (2)");

  await expect
    .poll(() => captured(app))
    .toStrictEqual([
      {
        title: "Example",
        body: `Verification code ${CODE}`,
        shown: true,
        actions: ["Copy"],
      },
    ]);
  expect(await copied(app)).toStrictEqual([]);
  expect(standIn.actions).toStrictEqual([]);

  await app.evaluate((_electron, label) => {
    const [notification] = Reflect.get(
      globalThis,
      "meruTestNotifications"
    ) as Captured[];

    notification?.act(notification.actions?.indexOf(label) ?? -1);
  }, "Copy");

  await expect.poll(() => copied(app)).toStrictEqual([CODE]);
  await expect
    .poll(() => standIn.actions)
    .toStrictEqual([{ account: ANY_SESSION, code: 3, messageId: "2" }]);
});

test("in immediately mode, shows the code and copies it while Do Not Disturb is on", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeStores(userDataDir, {
    settings: { verificationCodeCopyMode: "immediately" },
    state: { doNotDisturb: { until: null } },
  });
  standIn.setFeed(ANY_SESSION, { unreadCount: 1, mail: [plain] });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const gmail = await findPage(app, standIn.url);

  await expect(unread(shell)).toHaveAccessibleName("Home, 1 unread message");
  await expect(
    shell
      .getByRole("banner", { name: "Title bar" })
      .getByRole("button", { name: "Do Not Disturb" })
  ).toHaveAttribute("aria-pressed", "true");

  standIn.setFeed(ANY_SESSION, { unreadCount: 2, mail: [withCode, plain] });
  await retitle(gmail, "Inbox (2)");

  await expect
    .poll(() => captured(app))
    .toStrictEqual([
      {
        title: "Example",
        body: `Copied verification code ${CODE}`,
        shown: true,
        actions: undefined,
      },
    ]);
  await expect.poll(() => copied(app)).toStrictEqual([CODE]);
  expect(standIn.actions).toStrictEqual([]);
});

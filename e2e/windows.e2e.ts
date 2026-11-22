import type { ElectronApplication } from "@playwright/test";

import {
  expect,
  findPage,
  readOpenedExternally,
  stubSystemBrowser,
  test,
} from "./lib/app.ts";
import {
  confirmRemovals,
  openSettings,
  removeProfileInSettings,
} from "./lib/settings.ts";
import {
  ELSEWHERE_URL,
  FULL_MESSAGE_PATH,
  FULL_MESSAGE_TITLE,
  POPOUT_PATH,
  POPOUT_SIZE,
  POPOUT_TITLE,
} from "./lib/stand-in.ts";

/** The page of each window, the shell's first. */
const readWindows = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .map((window) => window.webContents.getURL())
      .toSorted(
        (a, b) =>
          Number(b.startsWith("meru-app:")) - Number(a.startsWith("meru-app:"))
      )
  );

/** The window showing `url`: its parent, size, visibility and session's folder. */
const readWindow = (app: ElectronApplication, page: string, gmail: string) =>
  app.evaluate(
    ({ BrowserWindow, webContents }, urls) => {
      const { page: shown, gmail: viewUrl } = urls;
      const window = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().startsWith(shown)
      );
      const view = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL() === viewUrl);

      return {
        parent: window?.getParentWindow() ?? null,
        size: window?.getBounds() && {
          width: window.getBounds().width,
          height: window.getBounds().height,
        },
        visible: window?.isVisible(),
        sameSession:
          window !== undefined &&
          window.webContents.session.storagePath ===
            view?.session.storagePath &&
          view?.session.storagePath !== null,
      };
    },
    { page, gmail }
  );

test("opens Gmail's pop-out as a window of its own in the profile's session, with its opener, at the size Gmail asks, and closes it when Gmail does", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const popoutUrl = `${standIn.url}${POPOUT_PATH.slice(1)}`;

  await view.getByRole("button", { name: "Pop out compose" }).click();

  const popout = await findPage(app, popoutUrl);

  await expect(
    popout.getByRole("heading", { name: POPOUT_TITLE })
  ).toBeVisible();
  await expect(popout.getByText("Has an opener")).toBeVisible();
  expect(await readWindow(app, popoutUrl, standIn.url)).toStrictEqual({
    parent: null,
    size: POPOUT_SIZE,
    visible: true,
    sameSession: true,
  });
  expect(await readWindows(app)).toHaveLength(2);

  // The click closes its own page, which Playwright can report as a failed click.
  await popout
    .getByRole("button", { name: "Send" })
    .click()
    .catch(() => null);

  await expect.poll(() => readWindows(app)).toHaveLength(1);
});

test("opens View entire message as a window with no opener, sends a link in mail to the browser unwrapped, and opens nothing for a blank window", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const fullMessageUrl = `${standIn.url}${FULL_MESSAGE_PATH.slice(1)}?`;

  await stubSystemBrowser(app);
  await view.getByRole("link", { name: "View entire message" }).click();

  const fullMessage = await findPage(app, fullMessageUrl);

  await expect(
    fullMessage.getByRole("heading", { name: FULL_MESSAGE_TITLE })
  ).toBeVisible();
  await expect(fullMessage.getByText("Has no opener")).toBeVisible();
  expect(await readWindow(app, fullMessageUrl, standIn.url)).toMatchObject({
    parent: null,
    sameSession: true,
  });

  await view.getByRole("button", { name: "Open a blank window" }).click();
  await view.getByRole("link", { name: "A link in mail" }).click();

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL]);
  expect(await readWindows(app)).toStrictEqual([
    expect.stringMatching(/^meru-app:/u),
    expect.stringMatching(/view=lg/u),
  ]);
});

test("keeps a pop-out on Gmail, handing a link that would leave it to the browser", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const popoutUrl = `${standIn.url}${POPOUT_PATH.slice(1)}`;

  await stubSystemBrowser(app);
  await view.getByRole("button", { name: "Pop out compose" }).click();

  const popout = await findPage(app, popoutUrl);

  // Meru refuses the navigation the click starts, which Playwright would
  // otherwise wait out.
  await popout
    .getByRole("link", { name: "Leave for another site" })
    .click({ noWaitAfter: true });

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL]);
  // Playwright's page waits on the refused navigation, so main is asked.
  expect(await readWindows(app)).toStrictEqual([
    expect.stringMatching(/^meru-app:/u),
    `${popoutUrl}?ver=1#cmid%253D1`,
  ]);
});

test("closes a pop-out whose first load is redirected off Gmail, handing the link to the browser", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await stubSystemBrowser(app);
  await view.getByRole("button", { name: "Pop out elsewhere" }).click();

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL]);
  await expect
    .poll(() => readWindows(app))
    .toStrictEqual([expect.stringMatching(/^meru-app:/u)]);
});

test("answers Add another account with a new profile, selected, opening no window", async ({
  app,
  shell,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await stubSystemBrowser(app);
  await view.getByRole("link", { name: "Add another account" }).click();

  await expect(
    shell
      .getByRole("group", { name: "Profiles" })
      .getByRole("button", { name: /^Profile 2/u })
  ).toHaveAttribute("aria-pressed", "true");
  expect(await readWindows(app)).toHaveLength(1);
  expect(await readOpenedExternally(app)).toStrictEqual([]);
});

test("keeps a pop-out open while the main window is hidden, and closes it with its profile", async ({
  app,
  shell,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const popoutUrl = `${standIn.url}${POPOUT_PATH.slice(1)}`;

  await view.getByRole("button", { name: "Pop out compose" }).click();
  await findPage(app, popoutUrl);

  const setShellShown = (shown: boolean) =>
    app.evaluate(({ BrowserWindow }, show) => {
      const window = BrowserWindow.getAllWindows().find((candidate) =>
        candidate.webContents.getURL().startsWith("meru-app:")
      );

      if (show) {
        window?.showInactive();
      } else {
        window?.hide();
      }
    }, shown);

  await setShellShown(false);
  expect(await readWindow(app, popoutUrl, standIn.url)).toMatchObject({
    visible: true,
  });
  await setShellShown(true);

  await view.getByRole("link", { name: "Add another account" }).click();
  const profile = (name: string) =>
    shell
      .getByRole("group", { name: "Profiles" })
      .getByRole("button", { name: new RegExp(`^${name}`, "u") });

  await expect(profile("Profile 2")).toHaveAttribute("aria-pressed", "true");

  await confirmRemovals(app);
  await profile("Default").click();
  await expect(profile("Default")).toHaveAttribute("aria-pressed", "true");
  await removeProfileInSettings(await openSettings(app), "Default");

  // The main window and Settings are left.
  await expect
    .poll(async () => {
      const urls = await readWindows(app);

      return urls.toSorted();
    })
    .toStrictEqual([
      expect.stringMatching(/^meru-app:\/\/settings/u),
      expect.stringMatching(/^meru-app:\/\/shell/u),
    ]);
});

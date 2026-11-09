/*
 * Deleting one account's browsing data from its row in Settings › Accounts.
 *
 * What a deletion reaches is read straight out of the account's partition in
 * the main process, so a cookie the test planted there is either still in the
 * session or it is not, whatever the page shows.
 *
 * The reload is read off a marker the test leaves on the Gmail view's
 * `window`: a reload builds a new document, which starts without it. The
 * stand-in Gmail redirects to its sign-in page, so the view's document is that
 * page, and so is the origin the localStorage entry belongs to.
 *
 * Pro for the disabled account alone, since a second account is Pro and the
 * only account cannot be disabled.
 */
import { expect, type Locator, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { type MeruApp, useApp, useProApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const COOKIE_NAME = "meru-test-cookie";

const LOCAL_STORAGE_KEY = "meru-test-local-storage";

function setCookie(meru: MeruApp, accountId: string) {
  return meru.app.evaluate(
    ({ session }, { partition, url, name }) =>
      session.fromPartition(partition).cookies.set({
        url,
        name,
        value: "1",
        // Persistent, so it is the kind a session keeps on disk.
        expirationDate: Date.now() / 1000 + 3600,
      }),
    { partition: `persist:${accountId}`, url: meru.gmailStandIn.origin, name: COOKIE_NAME },
  );
}

async function hasCookie(meru: MeruApp, accountId: string) {
  const cookies = await meru.app.evaluate(
    ({ session }, { partition, name }) => session.fromPartition(partition).cookies.get({ name }),
    { partition: `persist:${accountId}`, name: COOKIE_NAME },
  );

  return cookies.length > 0;
}

/**
 * Runs a script in the account's Gmail view, or reports `undefined` while the
 * view has no settled document to run it in.
 */
function evaluateInGmailView(meru: MeruApp, accountId: string, script: string) {
  return meru.app.evaluate(
    async ({ BrowserWindow }, { accountId, script }) => {
      const mainWindow = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes("main.html"),
      );

      const view = mainWindow?.contentView.children.find((child) =>
        (child as Electron.WebContentsView).webContents?.session.storagePath?.includes(accountId),
      ) as Electron.WebContentsView | undefined;

      if (
        !view ||
        view.webContents.isLoading() ||
        !view.webContents.getURL().includes("localhost")
      ) {
        return undefined;
      }

      return view.webContents.executeJavaScript(script) as Promise<unknown>;
    },
    { accountId, script },
  );
}

/** Marks the Gmail view's document and stores an entry in its localStorage. */
async function markGmailView(meru: MeruApp, accountId: string) {
  await expect
    .poll(() =>
      evaluateInGmailView(
        meru,
        accountId,
        `window.meruTestMarker = true; localStorage.setItem(${JSON.stringify(LOCAL_STORAGE_KEY)}, "1"); true`,
      ),
    )
    .toBe(true);
}

function readGmailView(meru: MeruApp, accountId: string) {
  return evaluateInGmailView(
    meru,
    accountId,
    `({ marked: window.meruTestMarker === true, stored: localStorage.getItem(${JSON.stringify(LOCAL_STORAGE_KEY)}) })`,
  );
}

/** The dialog, in the settings window, for the account labelled `label`. */
async function openDeleteBrowsingDataDialog(meru: MeruApp, label: string) {
  const settings = await meru.openSettings();

  await openSettingsPage(settings, "Accounts");

  await settings
    .locator('[data-slot="item-group"] [data-slot="item"]')
    .filter({ hasText: label })
    .getByRole("button", { name: "Account actions" })
    .click();

  await settings.getByRole("menuitem", { name: "Delete browsing data…" }).click();

  return settings.getByRole("alertdialog");
}

async function deleteData(dialog: Locator) {
  await dialog.getByRole("button", { name: "Delete data" }).click();

  await expect(dialog.page().getByText("Browsing data deleted")).toBeVisible();

  await expect(dialog).toHaveCount(0);
}

test.describe("with one account", () => {
  const meru = useApp({
    accounts: [seedAccount({ id: "first-account", label: "Personal" })],
  });

  test("the defaults delete the cache alone and reload the account", async () => {
    await markGmailView(meru, "first-account");

    await setCookie(meru, "first-account");

    const dialog = await openDeleteBrowsingDataDialog(meru, "Personal");

    await expect(dialog.getByRole("checkbox", { name: "Cached images and files" })).toBeChecked();

    await expect(
      dialog.getByRole("checkbox", { name: "Cookies and other site data" }),
    ).not.toBeChecked();

    await deleteData(dialog);

    await expect
      .poll(() => readGmailView(meru, "first-account"))
      .toEqual({ marked: false, stored: "1" });

    expect(await hasCookie(meru, "first-account")).toBe(true);
  });

  test("deleting cookies signs the account out and reloads it", async () => {
    await markGmailView(meru, "first-account");

    await setCookie(meru, "first-account");

    const dialog = await openDeleteBrowsingDataDialog(meru, "Personal");

    await dialog.getByRole("checkbox", { name: "Cookies and other site data" }).click();

    await deleteData(dialog);

    await expect
      .poll(() => readGmailView(meru, "first-account"))
      .toEqual({ marked: false, stored: null });

    expect(await hasCookie(meru, "first-account")).toBe(false);
  });

  test("nothing checked leaves nothing to delete", async () => {
    const dialog = await openDeleteBrowsingDataDialog(meru, "Personal");

    await dialog.getByRole("checkbox", { name: "Cached images and files" }).click();

    await expect(dialog.getByRole("button", { name: "Delete data" })).toBeDisabled();
  });

  test("a failed deletion says so in the dialog and can be tried again", async () => {
    // Electron hands back the same `Session` object for a partition, so this is
    // the one the account clears.
    await meru.app.evaluate(({ session }) => {
      session.fromPartition("persist:first-account").clearData = () =>
        Promise.reject(new Error("clearData failed for the test"));
    });

    const dialog = await openDeleteBrowsingDataDialog(meru, "Personal");

    await dialog.getByRole("button", { name: "Delete data" }).click();

    await expect(dialog.getByRole("alert")).toHaveText(
      "Meru couldn't delete this account's browsing data. Try again.",
    );

    await expect(dialog.getByRole("button", { name: "Delete data" })).toBeEnabled();

    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();

    await expect(dialog.page().getByText("Browsing data deleted")).toHaveCount(0);
  });
});

test.describe("with the second account disabled", () => {
  const meru = useProApp({
    accounts: [
      seedAccount({ id: "first-account", label: "Personal" }),
      seedAccount({ id: "second-account", label: "Work", selected: false, disabled: true }),
    ],
  });

  test("its partition's cookies are deleted without an instance", async () => {
    await setCookie(meru, "second-account");

    await setCookie(meru, "first-account");

    const dialog = await openDeleteBrowsingDataDialog(meru, "Work");

    await dialog.getByRole("checkbox", { name: "Cookies and other site data" }).click();

    await deleteData(dialog);

    expect(await hasCookie(meru, "second-account")).toBe(false);

    // The other account's partition is not touched.
    expect(await hasCookie(meru, "first-account")).toBe(true);
  });
});

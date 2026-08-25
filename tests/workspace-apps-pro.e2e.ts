/*
 * The half of the child view machinery that a license unlocks.
 *
 * Two things here are unreachable on the free version, and neither can be
 * faked: `getAccountConfigs` slices the account list down to one whenever
 * `licenseKey.isValid` is false, and the launcher is not rendered at all. Both
 * read a flag set only by a successful API response, so this file launches with
 * a real key — see `useProApp` in `tests/lib/app.ts` for what that costs.
 *
 * A file is entirely one entitlement or the other, because `useApp` is called
 * once at module scope and seeds every test in the file. The free version's
 * side of both claims lives in `tests/workspace-apps.e2e.ts`.
 */
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useProApp } from "./lib/app";
import { startTestServer, type TestServer } from "./lib/server";
import { readViews } from "./lib/views";

/* Fixed, because each account's session is partitioned on its id. */
const FIRST_ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const SECOND_ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac02";

const FIRST_TAB_TITLE = "Calendar";

const SECOND_TAB_TITLE = "Tasks";

let server: TestServer;

test.beforeAll(async () => {
  server = await startTestServer();
});

test.afterAll(async () => {
  await server.close();
});

const meru = useProApp(() => ({
  // Two, so the launcher resolves to a button with a menu behind it rather than
  // laying its apps out inline, and so the menu has more than one thing in it.
  "workspaceApps.launcherApps": ["calendar", "tasks"],
  accounts: [
    seedAccount({
      id: FIRST_ACCOUNT_ID,
      label: "First",
      selected: true,
      savedTabs: [
        seedSavedTab({
          app: "calendar",
          url: server.pageUrl(FIRST_TAB_TITLE),
          title: FIRST_TAB_TITLE,
          loadOnLaunch: true,
        }),
      ],
    }),
    seedAccount({
      id: SECOND_ACCOUNT_ID,
      label: "Second",
      selected: false,
      savedTabs: [
        seedSavedTab({
          app: "tasks",
          url: server.pageUrl(SECOND_TAB_TITLE),
          title: SECOND_TAB_TITLE,
          loadOnLaunch: true,
        }),
      ],
    }),
  ],
}));

/** Waits until both accounts have brought their saved tab back as a view. */
async function waitForBothRestoredViews() {
  await expect
    .poll(
      async () =>
        (await readViews(meru)).filter((view) => view.url.startsWith(server.origin)).length,
    )
    .toBe(2);
}

test("each account's views run in a session of its own", async () => {
  await waitForBothRestoredViews();

  const views = await readViews(meru);

  /*
   * Four: a Gmail view and a restored workspace app for each of the two
   * accounts. This is the assertion the free version cannot make at all —
   * there, the second account is sliced off before any of it is created.
   */
  expect(views).toHaveLength(4);

  const storagePathsByAccount = new Map<string, string[]>();

  for (const view of views) {
    expect(view.isDefaultSession, view.url).toBe(false);

    const accountId = [FIRST_ACCOUNT_ID, SECOND_ACCOUNT_ID].find((id) =>
      view.storagePath.includes(id),
    );

    expect(accountId, `${view.url} is in no account's partition`).toBeDefined();

    storagePathsByAccount.set(accountId as string, [
      ...(storagePathsByAccount.get(accountId as string) ?? []),
      view.url,
    ]);
  }

  /*
   * Two accounts, two views each, and no view in the wrong one. A workspace app
   * that landed in the other account's partition would be signed in as the
   * wrong person — which is the whole reason the sessions are split.
   */
  expect(storagePathsByAccount.size).toBe(2);

  expect(storagePathsByAccount.get(FIRST_ACCOUNT_ID)).toHaveLength(2);
  expect(storagePathsByAccount.get(SECOND_ACCOUNT_ID)).toHaveLength(2);

  // The two partitions really are different directories, rather than one path
  // that happens to contain both ids.
  const storagePaths = new Set(views.map((view) => view.storagePath));

  expect(storagePaths.size).toBe(2);
});

test("the launcher opens a workspace app that was never a saved tab", async () => {
  await waitForBothRestoredViews();

  const viewCountBefore = (await readViews(meru)).length;

  /*
   * The launcher is in the tab strip, and it is a renderer-drawn menu rather
   * than a native one, so it can be driven from here. It is only rendered at
   * all because the license is valid — the free version's side of that is
   * asserted in `workspace-apps.e2e.ts`.
   */
  await meru.renderer.getByRole("button", { name: "Open app" }).click();

  const launcherMenu = meru.renderer.getByRole("menu");

  await expect(launcherMenu).toBeVisible();

  await expect(launcherMenu.getByRole("menuitem")).toHaveCount(2);

  await launcherMenu.getByRole("menuitem").first().click();

  /*
   * A view is created for it. What that view goes on to load is a real Google
   * property, so nothing here waits on the page: the view exists the moment the
   * app opens the tab, and a load that never arrives is logged rather than
   * thrown. Asserting the count and not the URL is what keeps this test's
   * answer independent of a third party being up.
   */
  await expect.poll(async () => (await readViews(meru)).length).toBe(viewCountBefore + 1);

  // And it is in front, the way a tab opened by hand should be.
  await expect
    .poll(async () => (await readViews(meru)).at(-1)?.storagePath)
    .toContain(FIRST_ACCOUNT_ID);
});

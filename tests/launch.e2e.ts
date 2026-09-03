/*
 * Proves the app still launches. Starts the built app, routes it to appearance
 * settings and checks the renderer actually painted.
 *
 * The harness that launches it, and the reasoning behind how, lives in
 * `tests/lib/app.ts`.
 */
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp();

test("launches and renders appearance settings", async () => {
  const rendererErrors: Error[] = [];

  meru.renderer.on("pageerror", (error) => {
    rendererErrors.push(error);
  });

  /*
   * Appearance settings is reachable without signing in, and it renders nothing
   * until the config arrives from the main process. Waiting for its title to
   * appear therefore proves the renderer bundle loaded, React mounted, routing
   * works and an IPC round trip completed — not merely that a window exists.
   *
   * Reached through the menu and then the sidebar, the way anyone would. Setting
   * the fragment by hand arrives at the same page while proving nothing about
   * whether the app offers a way to get there.
   */
  const navigation = await meru.openSettings();

  await navigation.getByRole("button", { name: "Appearance", exact: true }).click();

  await expect(meru.renderer.getByTestId("settings-title")).toHaveText("Appearance");

  /*
   * Reaches the main process over its own Node inspector, which the debugging
   * protocol alone cannot see. A window can be a debugging target while never
   * being shown, so whether the app put something on screen is only answerable
   * from here.
   */
  const windows = await meru.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({
      title: window.getTitle(),
      isVisible: window.isVisible(),
    })),
  );

  expect(windows).toHaveLength(1);
  expect(windows[0]?.isVisible).toBe(true);

  expect(rendererErrors.map((error) => error.stack ?? error.message)).toEqual([]);
});

test("a packaged run without the fixture flag loads no extensions", async () => {
  /*
   * The checked-in fixture extension ships inside this build, and
   * MERU_EXTENSIONS_FIXTURE is what may load it. This launch does not set the
   * flag, so the account session has to come up with no extensions at all —
   * the claim that a shipped Meru loads nothing unless told to. The master
   * switch is off in a fresh config as well, so what this pins is the shipped
   * default rather than the flag on its own.
   *
   * The account's id is generated on first launch, so it is read back from
   * the config the app wrote rather than seeded.
   */
  let accountId: string | undefined;

  await expect
    .poll(async () => {
      accountId = (await meru.readConfig()).accounts?.[0]?.id;

      return accountId;
    })
    .toEqual(expect.any(String));

  const loadedExtensions = await meru.app.evaluate(
    ({ session }, partition) =>
      session
        .fromPartition(partition)
        .extensions.getAllExtensions()
        .map((extension) => extension.id),
    `persist:${accountId}`,
  );

  expect(loadedExtensions).toEqual([]);
});

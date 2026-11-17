// The shell's tooltips, drawn in a view of their own above the page. The
// window's blur hides that view, so this file runs alone.
import { PROFILE_NAME_MAX_LENGTH } from "#core/state.ts";

import {
  expect,
  expectTooltip,
  findPage,
  pointAt,
  readTooltipView,
  test,
  writeState,
} from "./lib/app.ts";

test("titlebar, profile and sidebar tooltips show over the page beside their trigger, never over it, and go with the pointer", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const longest = "W".repeat(PROFILE_NAME_MAX_LENGTH);

  await writeState(userDataDir, {
    profiles: [
      {
        id: "p0",
        name: "Home",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        ],
        selectedTabId: "gmail",
      },
      { id: "p1", name: longest },
    ],
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const bar = shell.getByRole("banner", { name: "Title bar" });
  const reload = bar.getByRole("button", { name: "Reload" });

  await findPage(app, standIn.url);
  await expect(reload).toBeEnabled();

  // Below the 40px titlebar, over the page, and clear of the button, which
  // a clear view over it would take clicks from.
  await pointAt(reload);
  await expectTooltip(app, "Reload");

  const [tooltip, button] = await Promise.all([
    readTooltipView(app),
    reload.boundingBox(),
  ]);

  expect(tooltip.bounds?.y ?? 0).toBeGreaterThanOrEqual(
    Math.floor((button?.y ?? 0) + (button?.height ?? 0))
  );
  expect(
    (tooltip.bounds?.y ?? 0) + (tooltip.bounds?.height ?? 0)
  ).toBeGreaterThan(40);

  await shell.mouse.move(1, 1);
  await expect
    .poll(async () => {
      const { visible } = await readTooltipView(app);

      return visible;
    })
    .toBe(false);

  // A name of the longest length, cut short in its button, whole in its
  // tooltip.
  await pointAt(
    bar
      .getByRole("group", { name: "Profiles" })
      .getByRole("button", { name: new RegExp(`^${longest}`, "u") })
  );
  await expectTooltip(app, longest);

  // A narrow sidebar's tile, named in its tooltip to its right.
  const tile = shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab")
    .nth(1);
  const title = (await tile.textContent()) ?? "";

  expect(title).not.toBe("");
  await pointAt(tile);
  await expectTooltip(app, title);

  const [tileTooltip, tileBox] = await Promise.all([
    readTooltipView(app),
    tile.boundingBox(),
  ]);

  expect(tileTooltip.bounds?.x ?? 0).toBeGreaterThanOrEqual(
    Math.floor((tileBox?.x ?? 0) + (tileBox?.width ?? 0))
  );

  // Do Not Disturb says how long it holds.
  const doNotDisturb = bar.getByRole("button", { name: "Do Not Disturb" });

  await doNotDisturb.click();
  await expect(doNotDisturb).toHaveAttribute("aria-pressed", "true");
  await pointAt(doNotDisturb);
  await expectTooltip(app, "Do Not Disturb is on until turned off");
});

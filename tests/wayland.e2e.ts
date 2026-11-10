/*
 * Under Wayland, the first launch maps the window, and keyboard and pointer
 * input reach the account's view.
 *
 * Each through the compositor rather than Playwright: sway's own tree says
 * whether the window mapped, wtype types through the virtual keyboard sway
 * hands to the focused surface, and sway's seat moves and presses the pointer.
 * The app has no `DISPLAY`, so an X11 fallback would fail to start rather than
 * pass.
 */
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";
import { useSwayDisplay } from "./lib/sway";

const APP_ID = "meru";

const TYPED_TEXT = "Typed under Wayland";

const sway = useSwayDisplay();

const meru = useApp(
  { accounts: [seedAccount({ id: "wayland-account", label: "Personal" })] },
  { args: ["--ozone-platform=wayland"] },
);

declare global {
  interface Window {
    waylandClicks: { isTrusted: boolean; target: string }[];
  }
}

test("the first launch maps the window, and keyboard and pointer input reach the account", async () => {
  await test.step("the window maps", async () => {
    await expect
      .poll(
        async () =>
          (await sway.readViews()).map(({ app_id, shell, visible }) => ({
            app_id,
            shell,
            visible,
          })),
        { message: "sway's tree holds one visible xdg_shell window for the app" },
      )
      .toEqual([{ app_id: APP_ID, shell: "xdg_shell", visible: true }]);
  });

  const { signInUrl } = meru.gmailStandIn;

  await expect
    .poll(() => meru.app.windows().some((page) => page.url() === signInUrl), {
      message: "the account's view loaded the stand-in",
    })
    .toBe(true);

  const accountView = meru.app.windows().find((page) => page.url() === signInUrl);

  if (!accountView) {
    throw new Error("The account's view is gone");
  }

  // Large and fixed, so the pointer step has a target well clear of the edges.
  await accountView.evaluate(() => {
    window.waylandClicks = [];

    const input = document.createElement("input");

    input.id = "wayland-input";

    const target = document.createElement("button");

    target.id = "wayland-target";

    target.style.cssText = "position: fixed; left: 200px; top: 200px; width: 300px; height: 200px";

    document.addEventListener("click", (event) => {
      window.waylandClicks.push({
        isTrusted: event.isTrusted,
        target: (event.target as Element).id,
      });
    });

    document.body.prepend(input, target);
  });

  await test.step("keyboard input arrives", async () => {
    // The view takes keys only once it is the window's focused one.
    await meru.app.evaluate(({ webContents }, url) => {
      webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === url)
        ?.focus();
    }, signInUrl);

    await accountView.locator("#wayland-input").focus();

    await sway.swaymsg(`[app_id="${APP_ID}"]`, "focus");

    await sway.type(TYPED_TEXT);

    await expect(accountView.locator("#wayland-input"), "what wtype typed").toHaveValue(TYPED_TEXT);
  });

  await test.step("pointer input arrives", async () => {
    const [view] = (await sway.readViews()).filter(({ app_id }) => app_id === APP_ID);

    if (!view) {
      throw new Error(`sway's tree no longer holds a window for ${APP_ID}`);
    }

    const { bounds, zoomFactor } = await meru.app.evaluate(
      ({ BrowserWindow, WebContentsView }, url) => {
        for (const window of BrowserWindow.getAllWindows()) {
          for (const child of window.contentView.children) {
            if (child instanceof WebContentsView && child.webContents.getURL() === url) {
              return {
                bounds: child.getBounds(),
                zoomFactor: child.webContents.getZoomFactor(),
              };
            }
          }
        }

        throw new Error("No view in any window has the account's page loaded");
      },
      signInUrl,
    );

    const targetRect = await accountView
      .locator("#wayland-target")
      .evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect);

    const originX = view.rect.x + view.window_rect.x + bounds.x;

    const originY = view.rect.y + view.window_rect.y + bounds.y;

    const x = Math.round(originX + (targetRect.x + targetRect.width / 2) * zoomFactor);

    const y = Math.round(originY + (targetRect.y + targetRect.height / 2) * zoomFactor);

    const seat = await sway.readSeat();

    await sway.swaymsg("seat", seat, "cursor", "set", String(x), String(y));

    await sway.swaymsg("seat", seat, "cursor", "press", "button1");

    await sway.swaymsg("seat", seat, "cursor", "release", "button1");

    await expect
      .poll(() => accountView.evaluate(() => window.waylandClicks), {
        message: `the clicks the page saw after sway's pointer pressed at ${x},${y}`,
      })
      .toEqual([{ isTrusted: true, target: "wayland-target" }]);
  });
});

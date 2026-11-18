/*
 * The window emits `show` whenever it is uncovered or its Space comes back,
 * while another app is in front, and `restore` when it is un-minimised. On
 * macOS, focusing the account view from either would order the window above
 * the app in front, so the view takes focus only while the window is focused,
 * and the window's own `focus` brings it the keys once it is.
 */
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useApp } from "./lib/app";

const ACCOUNT_ID = "only-account";

const meru = useApp(
  { accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })] },
  // Emptied, because a runner that sets it, as every Claude Code session does,
  // holds the view's focus back on every platform until the window is focused,
  // which would pass this without the macOS guard.
  { env: { MERU_BACKGROUND: "" } },
);

// At file scope rather than in a hook, as in `deep-link.e2e.ts`: the harness
// above registers its `beforeEach` first, so skipping from inside one would
// launch the app before deciding not to use it.
test.skip(
  process.platform !== "darwin",
  "only macOS orders a window to the front when one of its views is focused",
);

// The show and restore listeners refresh only a view that exists.
test.beforeEach(async () => {
  await expect
    .poll(() =>
      meru.app.evaluate(({ BrowserWindow }) =>
        (BrowserWindow.getAllWindows()[0]?.contentView.children ?? []).map((child) => {
          const { webContents } = child as Electron.WebContentsView;

          return webContents.getURL() !== "" && !webContents.isLoading();
        }),
      ),
    )
    .toEqual([true]);
});

/** How many times any `webContents` is focused while the window emits each event. */
function countFocusCalls(isFocused: boolean, events: string[]) {
  return meru.app.evaluate(
    ({ BrowserWindow, webContents }, { isFocused, events }) => {
      const [window] = BrowserWindow.getAllWindows();

      if (!window) {
        throw new Error("The app has no window");
      }

      const allWebContents = webContents.getAllWebContents();

      let calls = 0;

      // Counted and not passed on, since the real call would bring the window
      // in front of whatever another session is working in.
      for (const contents of allWebContents) {
        contents.focus = () => {
          calls++;
        };
      }

      window.isFocused = () => isFocused;

      try {
        for (const event of events) {
          window.emit(event);
        }
      } finally {
        Reflect.deleteProperty(window, "isFocused");

        for (const contents of allWebContents) {
          Reflect.deleteProperty(contents, "focus");
        }
      }

      return calls;
    },
    { isFocused, events },
  );
}

test("the window showing or restoring while unfocused leaves the account view unfocused", async () => {
  expect(await countFocusCalls(false, ["show", "restore"])).toBe(0);
});

test("the window showing while focused focuses the account view", async () => {
  expect(await countFocusCalls(true, ["show"])).toBeGreaterThanOrEqual(1);
});

test("the window gaining focus focuses the account view", async () => {
  expect(await countFocusCalls(true, ["focus"])).toBeGreaterThanOrEqual(1);
});

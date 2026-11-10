/*
 * A screen share through Meru's own picker hands the page a stream that is
 * really capturing: the sources are the system's, picked in the picker's own
 * interface, and the frames reach a `<video>`. That the picker stays on its
 * document is `renderer-page-navigation-pro.e2e.ts`'s.
 *
 * Under a license, because the picker opens only for a Google Meet tab, which
 * is a workspace app. The Meet page is served in the account's own session, so
 * nothing reaches Google.
 */
import { ms } from "@meru/shared/ms";
import { expect, type Page, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { useProApp } from "./lib/app";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac02";

const MEET_URL = "https://meet.google.com/e2e-screen-share";

/** Titled apart from the app's label, so the tab reading it proves the page arrived. */
const MEET_PAGE_TITLE = "Meet Stand-In";

type ShareState =
  | { state: "pending" }
  | { state: "rejected"; error: string }
  | {
      state: "resolved";
      active: boolean;
      tracks: { kind: string; readyState: string; settingsHaveSize: boolean }[];
      videoHasSize: boolean;
    };

const meru = useProApp({
  // The system picker answers on the operating system's side and never opens
  // Meru's page.
  "screenShare.useSystemPicker": false,
  accounts: [
    seedAccount({
      id: ACCOUNT_ID,
      label: "Personal",
      savedTabs: [seedSavedTab({ app: "meet", url: MEET_URL, title: "Meet" })],
    }),
  ],
});

function runInMeet(script: string) {
  return meru.app.evaluate(
    ({ webContents }, { meetUrl, source }) =>
      webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL() === meetUrl)
        ?.executeJavaScript(source, true),
    { meetUrl: MEET_URL, source: script },
  );
}

function readShare() {
  return runInMeet("window.__readShare()") as Promise<ShareState>;
}

test("a screen picked in the screen share picker reaches the page as a live video track", async () => {
  if (process.platform === "darwin") {
    // Asked before anything that lists or captures a screen, since those raise
    // the Screen Recording prompt when the grant is missing and no one is here
    // to answer it.
    const screenAccess = await meru.app.evaluate(({ systemPreferences }) =>
      systemPreferences.getMediaAccessStatus("screen"),
    );

    test.skip(
      screenAccess !== "granted",
      `macOS has not granted Screen Recording to the process that launched the suite (status "${screenAccess}"), so the share cannot capture`,
    );
  }

  await meru.app.evaluate(
    ({ session }, { partition, title }) => {
      session.fromPartition(partition).protocol.handle(
        "https",
        () =>
          new Response(`<!doctype html><title>${title}</title>`, {
            headers: { "content-type": "text/html" },
          }),
      );
    },
    { partition: `persist:${ACCOUNT_ID}`, title: MEET_PAGE_TITLE },
  );

  await meru.renderer.getByRole("button", { name: "Meet" }).click();

  await expect(meru.renderer.getByRole("button", { name: MEET_PAGE_TITLE })).toBeVisible();

  // Started with a user gesture, which Chromium requires of a screen share
  // request, and read back by polling, since it settles only once the picker
  // is answered.
  await runInMeet(`
    (() => {
      let share = { state: "pending" };
      let stream;
      const video = document.createElement("video");
      video.muted = true;
      document.body.append(video);

      window.__readShare = () => {
        if (share.state !== "resolved") {
          return share;
        }
        return {
          state: "resolved",
          active: stream.active,
          tracks: stream.getTracks().map((track) => {
            const { width = 0, height = 0 } = track.getSettings();
            return {
              kind: track.kind,
              readyState: track.readyState,
              settingsHaveSize: width > 0 && height > 0,
            };
          }),
          videoHasSize: video.videoWidth > 0 && video.videoHeight > 0,
        };
      };

      window.__stopShare = () => {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      };

      navigator.mediaDevices.getDisplayMedia({ video: true }).then(
        (result) => {
          stream = result;
          video.srcObject = result;
          video.play().catch(() => undefined);
          share = { state: "resolved" };
        },
        (error) => {
          share = { state: "rejected", error: error.name + ": " + error.message };
        },
      );
    })();
  `);

  const isPicker = (page: Page) => new URL(page.url()).pathname.endsWith("/desktop-sources.html");

  await expect.poll(() => meru.app.windows().some(isPicker)).toBe(true);

  const picker = meru.app.windows().find(isPicker) as Page;

  await picker.getByRole("tab", { name: "Screens" }).click();

  const screens = picker.getByRole("tabpanel").getByRole("img");

  // The sources come from the system, so the list is waited for rather than
  // assumed: an empty one means the platform listed no screen to share.
  await expect(screens.first()).toBeVisible();

  await screens.first().click();

  // Share destroys the picker, which can take the page away before Playwright
  // hears the click land, so the click's error counts only while it is open.
  // The click is awaited before the close, so a Share that cannot be pressed
  // fails with the click's own log rather than with the close timing out.
  const closed = picker.waitForEvent("close", { timeout: ms("5s") });

  // Handled here as well, so a click that throws leaves no rejection unheard.
  closed.catch(() => undefined);

  await picker
    .getByRole("button", { name: "Share" })
    .click({ timeout: ms("5s") })
    .catch((error: unknown) => {
      if (!picker.isClosed()) {
        throw error;
      }
    });

  await closed;

  await expect.poll(async () => (await readShare()).state).not.toBe("pending");

  // Checked once rather than polled, so a refusal fails at once and prints its
  // error, rather than after the timeout.
  expect(await readShare()).not.toMatchObject({ state: "rejected" });

  // A frame having arrived is what gives the video a size, so a nonzero one
  // says the capture is producing frames, not just that a track was made.
  await expect.poll(readShare).toEqual({
    state: "resolved",
    active: true,
    tracks: [{ kind: "video", readyState: "live", settingsHaveSize: true }],
    videoHasSize: true,
  });

  await runInMeet("window.__stopShare()");

  await expect
    .poll(readShare)
    .toMatchObject({ state: "resolved", active: false, tracks: [{ readyState: "ended" }] });
});

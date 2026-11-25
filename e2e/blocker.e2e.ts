import type { ElectronApplication, Page } from "@playwright/test";

import { expect, findPage, test, writeSettings } from "./lib/app.ts";
import { BLOCKER_IMAGES } from "./lib/stand-in.ts";
import type { BlockerImage, StandIn } from "./lib/stand-in.ts";

const setSetting = (app: ElectronApplication, key: string, value: boolean) =>
  app.evaluate(
    async (_electron, [settingKey, settingValue]) => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        set: (key: string, value: unknown) => Promise<void>;
      };

      await settings.set(settingKey, settingValue);
    },
    [key, value] as const
  );

/** Each image's line in the message once it has settled, loaded or blocked. */
const expectImages = async (
  view: Page,
  outcomes: Record<BlockerImage, "loaded" | "blocked">
) => {
  const images = view.getByRole("list", { name: "Images" });

  for (const [image, outcome] of Object.entries(outcomes)) {
    // oxlint-disable-next-line no-await-in-loop -- one line at a time reads better on failure
    await expect(
      images.getByText(`${BLOCKER_IMAGES[image as BlockerImage]}: ${outcome}`)
    ).toBeVisible();
  }
};

const openMessage = async (app: ElectronApplication, standIn: StandIn) => {
  const gmail = await findPage(app, standIn.url);

  await gmail.goto(standIn.blockerUrl);

  return gmail;
};

// The suite's build refuses, and fails the test for, any request leaving the
// machine, the ad's included: a test that ends clean had the blocker stop it
// first.
test("blocks ads, Gmail's telemetry and a proxied open-tracking pixel by default, and never a sender's image", async ({
  launchApp,
  standIn,
}) => {
  const app = await launchApp();
  const gmail = await openMessage(app, standIn);

  await expectImages(gmail, {
    ad: "blocked",
    telemetry: "blocked",
    pixel: "blocked",
    logo: "loaded",
  });
  expect(standIn.blockerServed).toStrictEqual(["logo"]);
});

test("Block trackers turned off reaches the page's next requests at once, and ads stay blocked", async ({
  launchApp,
  standIn,
}) => {
  const app = await launchApp();
  const gmail = await openMessage(app, standIn);

  await expectImages(gmail, {
    ad: "blocked",
    telemetry: "blocked",
    pixel: "blocked",
    logo: "loaded",
  });

  await setSetting(app, "blockTrackers", false);
  await gmail.reload();

  await expectImages(gmail, {
    ad: "blocked",
    telemetry: "loaded",
    pixel: "loaded",
    logo: "loaded",
  });

  await setSetting(app, "blockTrackers", true);
  await gmail.reload();

  await expectImages(gmail, {
    ad: "blocked",
    telemetry: "blocked",
    pixel: "blocked",
    logo: "loaded",
  });
  expect(standIn.blockerServed.toSorted()).toStrictEqual([
    "logo",
    "logo",
    "logo",
    "pixel",
    "telemetry",
  ]);
});

test("reads Block trackers from settings.json at launch", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { blockTrackers: false });

  const app = await launchApp();
  const gmail = await openMessage(app, standIn);

  await expectImages(gmail, {
    ad: "blocked",
    telemetry: "loaded",
    pixel: "loaded",
    logo: "loaded",
  });
});

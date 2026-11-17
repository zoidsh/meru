import type { ElectronApplication, Locator, Page } from "@playwright/test";

import type { GmailHealth } from "#contract/gmail.ts";
import { DARK } from "#core/gmail-dark.ts";

import { expect, findPage, test } from "./lib/app.ts";
import { DARK_PARTS, openDarkThread, setGmailDark } from "./lib/stand-in.ts";

const WHITE = "rgb(255, 255, 255)";

const CLEAR = "rgba(0, 0, 0, 0)";

const lastHooks = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (
        Reflect.get(globalThis, "meruTestGmailPage") as {
          health: GmailHealth[];
        }
      ).health.at(-1)?.hooks
  );

const setDarkTheme = (app: ElectronApplication, on: boolean) =>
  app.evaluate(async (_electron, value) => {
    const settings = Reflect.get(globalThis, "meruTestSettings") as {
      set: (key: string, value: unknown) => Promise<void>;
    };

    await settings.set("extendDarkTheme", value);
  }, on);

const style = (locator: Locator, property: string) =>
  locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property
  );

/** The style of what holds `locator`'s element, `levels` up. */
const holderStyle = (locator: Locator, property: string, levels: number) =>
  locator.evaluate(
    (element, [name, up]) => {
      let holder: Element | null = element;

      for (let level = 0; level < up; level += 1) {
        holder = holder?.parentElement ?? null;
      }

      return holder ? getComputedStyle(holder).getPropertyValue(name) : "";
    },
    [property, levels] as const
  );

const parts = (view: Page) => ({
  pane: view.getByRole("region", { name: DARK_PARTS.pane }),
  subject: view.getByRole("heading", { name: DARK_PARTS.subject }),
  sender: view.getByText(DARK_PARTS.sender),
  reply: view.getByRole("link", { name: DARK_PARTS.reply }),
  compose: view.getByRole("dialog", { name: DARK_PARTS.compose }),
  editor: view.getByRole("textbox", { name: DARK_PARTS.editor }),
  body: view.getByText(DARK_PARTS.body),
});

/** Whether the stand-in's pane shows the dark theme or Gmail's own white. */
const paneBackground = (view: Page) =>
  style(parts(view).pane, "background-color");

/**
 * What every element in a body or a draft looks like, by the properties a
 * theme could reach.
 */
const mailFingerprint = (view: Page) =>
  view.evaluate(() => {
    const properties = [
      "color",
      "background-color",
      "border-top-color",
      "fill",
      "caret-color",
      "color-scheme",
      "filter",
      "opacity",
      "font-size",
      "display",
    ];

    return [
      ...document.querySelectorAll(
        ".a3s, .a3s *, [contenteditable], [contenteditable] *"
      ),
    ].map((element) => {
      const computed = getComputedStyle(element);

      return properties
        .map((property) => computed.getPropertyValue(property))
        .join("|");
    });
  });

test("darkens each of Gmail's white surfaces while Gmail is Dark, keeping a body and a draft on Gmail's own white", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const each = parts(view);

  await openDarkThread(view, true);
  await expect.poll(() => paneBackground(view)).toBe(CLEAR);
  expect(await style(each.subject, "color")).toBe(DARK.text);
  expect(await style(each.sender, "color")).toBe(DARK.text);
  expect(await style(each.reply, "color")).toBe(DARK.text);
  // The compose window's own surface, a level in from its dialog.
  expect(
    await each.compose.evaluate(
      (dialog) =>
        getComputedStyle(dialog.children[1] as Element).backgroundColor
    )
  ).toBe(DARK.surface);
  expect(await holderStyle(each.editor, "background-color", 1)).toBe(WHITE);
  expect(await holderStyle(each.body, "background-color", 2)).toBe(WHITE);
  expect(await style(each.body, "color")).toBe(DARK.cardText);
  await expect
    .poll(() => lastHooks(app), { timeout: 15_000 })
    .toMatchObject({
      darkPane: "matched",
      darkPaneText: "matched",
      darkCompose: "matched",
      darkComposeText: "matched",
      editorCard: "matched",
      bodyCard: "matched",
      darkMenu: "absent",
      darkDialog: "absent",
    });
});

test("leaves Gmail's page as Gmail draws it while Gmail is not Dark, and darkens it from the next move once Gmail is", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const each = parts(view);

  await openDarkThread(view, false);
  await expect
    .poll(() => lastHooks(app), { timeout: 15_000 })
    .toMatchObject({ darkPane: "matched", bodyCard: "matched" });
  expect(await paneBackground(view)).toBe(WHITE);
  expect(await style(each.subject, "color")).toBe("rgb(31, 31, 31)");
  expect(await holderStyle(each.body, "background-color", 2)).toBe(CLEAR);

  await setGmailDark(view, true);
  await expect.poll(() => paneBackground(view)).toBe(CLEAR);
  await setGmailDark(view, false);
  await expect.poll(() => paneBackground(view)).toBe(WHITE);
});

test("switches the dark theme off and on while the page stays loaded, changing nothing in a body or a draft", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await openDarkThread(view, true);
  await expect.poll(() => paneBackground(view)).toBe(CLEAR);
  await view.evaluate(() => {
    Reflect.set(window, "keptAcrossSwitches", true);
  });

  const on = await mailFingerprint(view);

  await setDarkTheme(app, false);
  await expect.poll(() => paneBackground(view)).toBe(WHITE);

  const off = await mailFingerprint(view);

  await setDarkTheme(app, true);
  await expect.poll(() => paneBackground(view)).toBe(CLEAR);

  expect(off.length).toBeGreaterThan(10);
  expect(on).toStrictEqual(off);
  // Mail written in Gmail's own classes keeps its own white and colours.
  expect(
    await holderStyle(
      view.getByRole("heading", { name: DARK_PARTS.mimic }),
      "background-color",
      1
    )
  ).toBe(WHITE);
  expect(
    await style(view.getByRole("heading", { name: DARK_PARTS.mimic }), "color")
  ).toBe("rgb(31, 31, 31)");
  expect(
    await view.evaluate(() => Reflect.get(window, "keptAcrossSwitches"))
  ).toBe(true);
});

test("reports the pane broken when Gmail renames it in a thread, which then stays as Gmail draws it", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const { pane } = parts(view);

  await openDarkThread(view, true);
  await expect.poll(() => paneBackground(view)).toBe(CLEAR);
  await pane.evaluate((element) => {
    element.setAttribute("class", "nH a98 renamed");
    element.setAttribute("style", "background-color: rgb(255, 255, 255)");
    location.hash = "#inbox/t1/renamed";
  });

  await expect
    .poll(() => lastHooks(app), { timeout: 15_000 })
    .toMatchObject({ darkPane: "broken", bodyCard: "matched" });
  expect(await paneBackground(view)).toBe(WHITE);
});

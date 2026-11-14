import { describe, expect, it } from "vitest";

import { FakeClock } from "../../test/fakes/clock.ts";
import { FakeLifecycle } from "../../test/fakes/lifecycle.ts";
import { FakeLog } from "../../test/fakes/log.ts";
import {
  logFailures,
  PAGE_ERROR_WINDOW,
  PAGE_ERRORS_PER_WINDOW,
} from "./failures.ts";

const OWN = "file:///app/dist/renderer/chrome.html?platform=darwin";
const GMAIL = "https://mail.google.com/mail/u/0/#inbox";

const setup = () => {
  const lifecycle = new FakeLifecycle();
  const log = new FakeLog();
  const clock = new FakeClock();
  const stop = logFailures({
    clock,
    lifecycle,
    log: log.scoped("app"),
    ownPage: (url) => url.startsWith("file:///app/dist/renderer/"),
  });
  return { clock, lifecycle, log, stop };
};

describe(logFailures, () => {
  it("writes an uncaught exception and an unhandled rejection with their errors", () => {
    const { lifecycle, log } = setup();
    const thrown = new Error("boom");
    lifecycle.fail({ error: thrown, kind: "uncaught" });
    lifecycle.fail({ error: "no reason", kind: "unhandledRejection" });
    expect(log.entries).toStrictEqual([
      {
        fields: { error: thrown },
        level: "error",
        message: "An exception was not caught",
        scope: "app",
      },
      {
        fields: { error: "no reason" },
        level: "error",
        message: "A rejected promise was not handled",
        scope: "app",
      },
    ]);
  });

  it("writes a process that crashed or was killed, and not one that exited cleanly", () => {
    const { lifecycle, log } = setup();
    lifecycle.fail({
      exitCode: 0,
      kind: "processGone",
      process: "renderer",
      reason: "clean-exit",
      url: GMAIL,
    });
    lifecycle.fail({
      exitCode: 11,
      kind: "processGone",
      process: "renderer",
      reason: "crashed",
      url: GMAIL,
    });
    lifecycle.fail({
      exitCode: 9,
      kind: "processGone",
      process: "GPU",
      reason: "killed",
      url: "",
    });
    expect(log.entries.map((entry) => entry.fields)).toStrictEqual([
      { exitCode: 11, process: "renderer", reason: "crashed", url: GMAIL },
      { exitCode: 9, process: "GPU", reason: "killed", url: "" },
    ]);
  });

  it("writes a console error from the app's own pages only", () => {
    const { lifecycle, log } = setup();
    for (const url of [OWN, GMAIL]) {
      lifecycle.fail({
        contentsId: 1,
        kind: "consoleError",
        line: 12,
        message: "Uncaught TypeError: x is undefined",
        source: url,
        url,
      });
    }
    expect(log.entries).toStrictEqual([
      {
        fields: {
          line: 12,
          source: OWN,
          text: "Uncaught TypeError: x is undefined",
          url: OWN,
        },
        level: "error",
        message: "A page logged an error",
        scope: "app",
      },
    ]);
  });

  it("writes a page's first errors in a window and only counts the rest, saying so once the window ends", () => {
    const { clock, lifecycle, log } = setup();
    const flood = (contentsId: number, count: number) => {
      for (let index = 0; index < count; index += 1) {
        lifecycle.fail({
          contentsId,
          kind: "consoleError",
          line: 1,
          message: `flood ${index}`,
          source: OWN,
          url: OWN,
        });
      }
    };
    flood(1, PAGE_ERRORS_PER_WINDOW + 500);
    flood(2, 1);
    const inWindow = log.entries.length;
    clock.advance(PAGE_ERROR_WINDOW);
    flood(1, 1);
    expect([
      inWindow,
      log.entries.slice(inWindow).map(({ fields, message }) => ({
        fields,
        message,
      })),
    ]).toStrictEqual([
      PAGE_ERRORS_PER_WINDOW + 1,
      [
        {
          fields: { dropped: 500, url: OWN },
          message: "A page's errors were dropped",
        },
        {
          fields: { line: 1, source: OWN, text: "flood 0", url: OWN },
          message: "A page logged an error",
        },
      ],
    ]);
  });

  it("writes nothing once stopped", () => {
    const { lifecycle, log, stop } = setup();
    stop();
    lifecycle.fail({ error: new Error("late"), kind: "uncaught" });
    expect(log.entries).toStrictEqual([]);
  });
});

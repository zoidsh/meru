import { describe, expect, it } from "vitest";

import { recordInto, silentLog } from "#core/log.fake.ts";

import { StartupError, createFailures } from "./failures.ts";

const setup = () => {
  const calls: string[] = [];
  const failures = createFailures({
    productName: "Meru",
    showErrorDialog: (title) => calls.push(`dialog: ${title}`),
    log: recordInto(calls, {}, "log: "),
    exit: (code) => calls.push(`exit: ${code}`),
  });

  return { calls, failures };
};

describe(createFailures, () => {
  it("ends the app with a dialog when startup fails", () => {
    const { calls, failures } = setup();

    failures.report(new Error("no display"));

    expect(calls).toStrictEqual([
      expect.stringMatching(/^log: start-failed error="no display \| at /u),
      "dialog: Meru could not start",
      "exit: 1",
    ]);
  });

  it("reports only the first startup failure", () => {
    const { calls, failures } = setup();

    failures.report(new Error("first"));
    failures.report(new Error("second"));

    expect(calls.filter((call) => call.startsWith("dialog"))).toHaveLength(1);
  });

  it("lets a quit go on when it interrupts startup, with no dialog", () => {
    const { calls, failures } = setup();

    failures.markQuitting();
    failures.report(new Error("ERR_ABORTED (-3) loading 'meru-app://shell/'"));

    expect(calls).toStrictEqual([
      `log: quit-interrupted error="ERR_ABORTED (-3) loading 'meru-app:'"`,
    ]);
  });

  it("logs an error after startup in its own words and keeps running", () => {
    const { calls, failures } = setup();

    failures.markStarted();
    failures.report(new Error("late"));

    expect(calls).toStrictEqual([
      expect.stringMatching(/^log: main-error error="late \| at /u),
    ]);
  });

  it("shows a failure written for the person without a stack", () => {
    const details: string[] = [];
    const failures = createFailures({
      productName: "Meru",
      showErrorDialog: (_title, message) => details.push(message),
      log: silentLog,
      exit: () => false,
    });

    failures.report(new StartupError("Saved by a newer version."));

    expect(details).toStrictEqual(["Saved by a newer version."]);
  });
});

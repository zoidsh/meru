import { describe, expect, it } from "vitest";

import { createFailures } from "./failures.ts";

const setup = () => {
  const calls: string[] = [];
  const failures = createFailures({
    productName: "Meru",
    showErrorDialog: (title) => calls.push(`dialog: ${title}`),
    log: (message) => calls.push(`log: ${message.split("\n")[0]}`),
    exit: (code) => calls.push(`exit: ${code}`),
  });

  return { calls, failures };
};

describe(createFailures, () => {
  it("ends the app with a dialog when startup fails", () => {
    const { calls, failures } = setup();

    failures.report(new Error("no display"));

    expect(calls).toStrictEqual([
      "log: Meru could not start: Error: no display",
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
      "log: Interrupted by quitting: Error: ERR_ABORTED (-3) loading 'meru-app://shell/'",
    ]);
  });

  it("logs an error after startup in its own words and keeps running", () => {
    const { calls, failures } = setup();

    failures.markStarted();
    failures.report(new Error("late"));

    expect(calls).toStrictEqual([
      "log: Unexpected error in the main process: Error: late",
    ]);
  });
});

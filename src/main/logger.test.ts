import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scrub } from "#core/log.ts";
import { newProfile } from "#core/state.ts";
import { fakeLogFile } from "#platform/log-file.fake.ts";

import { createLogger, FLUSH_AFTER } from "./logger.ts";

const setup = (failing = false) => {
  const file = fakeLogFile({ failing });
  const echoed: string[] = [];
  const logger = createLogger({
    file,
    context: {},
    now: () => new Date(Date.now()),
    echo: (line) => echoed.push(line),
  });

  return { file, echoed, logger };
};

describe("the logger", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prints each line at once and writes them together a moment later", async () => {
    const { file, echoed, logger } = setup();

    logger.started({
      productName: "Meru",
      version: "4.0.0",
      build: "prod",
      os: "darwin",
      osVersion: "26.2.0",
      arch: "arm64",
      electron: "45.2.3",
    });
    logger.log("page-load-failed", {
      host: scrub.host("https://mail.google.com/mail/u/0/#inbox"),
    });

    expect(echoed).toHaveLength(2);
    expect(file.text()).toBe("");

    await vi.advanceTimersByTimeAsync(FLUSH_AFTER);

    expect(file.text()).toBe(`${echoed.join("\n")}\n`);
    expect(file.text()).toContain(
      "1970-01-01T00:00:00.000Z page-load-failed host=mail.google.com\n"
    );
  });

  it("names a profile by its place once it follows the state", () => {
    const { echoed, logger } = setup();

    logger.follow(() => [newProfile("a", "Work"), newProfile("b", "Home")]);
    logger.log("profile-added", { profile: scrub.profile("b") });

    expect(echoed[0]).toContain('profile="profile 2"');
  });

  it("writes what waits at once on a flush, blocking or not", async () => {
    const { file, logger } = setup();

    logger.log("app-quit");
    logger.flushSync();

    expect(file.text()).toContain("app-quit\n");

    logger.log("app-quit");
    await logger.flush();

    expect(file.text().match(/app-quit/gu)).toHaveLength(2);
  });

  it("copies what was logged, the lines still waiting included", async () => {
    const { file, logger } = setup();

    logger.log("app-quit");
    await logger.copyTo("/Downloads/Meru logs.txt");

    expect(file.copies.get("/Downloads/Meru logs.txt")).toContain("app-quit");
  });

  it("never throws or rejects when the file cannot be written", async () => {
    const { logger, echoed } = setup(true);

    logger.log("store-unreadable", { error: scrub.error(new Error("disk")) });
    logger.flushSync();
    logger.log("store-unreadable");
    await logger.flush();
    await vi.advanceTimersByTimeAsync(FLUSH_AFTER);

    expect(echoed).toHaveLength(2);
  });
});

import { expect, mock, spyOn, test } from "bun:test";

/*
 * A file of its own, since the failing catalog is mocked for the whole module
 * graph the file loads.
 */
mock.module("./locales/de", () => {
  throw new Error("The chunk failed to load");
});

const { activateLocale, i18n } = await import(".");

test("activates English, and logs why, when a catalog fails to load", async () => {
  const consoleError = spyOn(console, "error").mockImplementation(() => {});

  expect(await activateLocale("de")).toBe("en");

  expect(i18n.locale).toBe("en");

  expect(consoleError).toHaveBeenCalledTimes(1);

  consoleError.mockRestore();
});

import { afterEach, describe, expect, test } from "bun:test";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { getAccountLabel } from "./accounts";
import { createDefaultConfig } from "./config";
import { activateLocale, i18n } from "./i18n";

const seededLabel = createDefaultConfig({
  accountId: "first-account",
  downloadsLocation: "",
  trayEnabled: false,
}).accounts[0]?.label;

/** A German catalog made here, holding only the default account's label. */
function activateGermanFixture() {
  i18n.loadAndActivate({
    locale: "de",
    messages: {
      [generateMessageId("Default", "account label")]: compileMessageOrThrow("Standard"),
    },
  });
}

afterEach(async () => {
  await activateLocale("en");
});

describe("getAccountLabel", () => {
  test("translates the label the first account is seeded with", () => {
    activateGermanFixture();

    expect(seededLabel).toBe("Default");
    expect(getAccountLabel("Default")).toBe("Standard");
  });

  test("shows the seeded label as it is in English", () => {
    expect(getAccountLabel("Default")).toBe("Default");
  });

  test("leaves every other label as the user wrote it", () => {
    activateGermanFixture();

    for (const label of ["Work", "default", "Default ", "Standard", "🏠 Default", ""]) {
      expect(getAccountLabel(label)).toBe(label);
    }
  });
});

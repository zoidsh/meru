import { describe, expect, test } from "bun:test";
import { getExtensionIdFromManifestKey, isExtensionId } from "./extension-id";

/** 1Password 8.12.32.33, whose Chrome Web Store id this key has to derive. */
const ONE_PASSWORD_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnHpaUll4uWujpAdbIXOQY2WE6hk8PllsYsnoUaj5qHXwv4IB6A9pONqGaTL2KL20u6E6XVhncY6Ae6SQSBQqiIkgjPsiG0NDNsDlju/kzBnfimKFC/bpzOrqFqbhswQHifnet5uHlpG97whTzLO3ka0M5aqB9V9mD/0qVXvNgAVVnSTULH254YqpeCcAhmsKiFZSL6OrOZmCp8kZ/OeOUK9iYWYylL7VcOXVrZf10EPrlaCNXzVk7K35dPuQ7svhA0Pgju3kngB4RLa5Iojhw3IT+B5+m8pisjOSd1oKMrRmhGs7rDhF5IEtAiVxqVp7uOOMPQj3vrbMDAzf7vqLtQIDAQAB";

describe("getExtensionIdFromManifestKey", () => {
  test("derives the id Chromium gives the extension", () => {
    expect(getExtensionIdFromManifestKey(ONE_PASSWORD_KEY)).toBe(
      "aeblfdkhhhdcdjpifhhbdiojplfjncoa",
    );
  });

  test("writes the id in the a-p alphabet only", () => {
    expect(getExtensionIdFromManifestKey("dGVzdC1rZXk=")).toBe("gckpihaehgepkpiokicpmgbmojmemdja");
  });

  test("has no id for a manifest without a key", () => {
    expect(getExtensionIdFromManifestKey(undefined)).toBeUndefined();
  });
});

describe("isExtensionId", () => {
  test("accepts an id Chromium would write", () => {
    expect(isExtensionId("aeblfdkhhhdcdjpifhhbdiojplfjncoa")).toBe(true);
  });

  test("refuses a string outside the a-p alphabet", () => {
    expect(isExtensionId("zeblfdkhhhdcdjpifhhbdiojplfjncoa")).toBe(false);
    expect(isExtensionId("AEBLFDKHHHDCDJPIFHHBDIOJPLFJNCOA")).toBe(false);
    expect(isExtensionId("aeblfdkhhhdcdjpifhhbdiojplfjnco1")).toBe(false);
  });

  test("refuses a string that is not 32 characters", () => {
    expect(isExtensionId("")).toBe(false);
    expect(isExtensionId("aeblfdkhhhdcdjpifhhbdiojplfjnco")).toBe(false);
    expect(isExtensionId("aeblfdkhhhdcdjpifhhbdiojplfjncoaa")).toBe(false);
  });

  test("refuses a path rather than an id", () => {
    expect(isExtensionId("../..")).toBe(false);
    expect(isExtensionId("aeblfdkhhhdcdjpifhhbdiojplfjnco/")).toBe(false);
    expect(isExtensionId("aeblfdkhhhdcdjpifhhbdiojplfjncoa\n")).toBe(false);
  });
});

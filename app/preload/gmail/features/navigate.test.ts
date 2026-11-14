import { describe, expect, it } from "vitest";

import { gmailPushes } from "../../../shared/channels/gmail.ts";
import { mountGmail, testSettings } from "../testing.ts";
import { navigate } from "./navigate.ts";

describe(navigate.id, () => {
  it("takes the page to the fragment main sends", () => {
    const page = mountGmail({ features: [navigate] });

    page.bridge.push(gmailPushes.navigate, { hash: "#inbox/abc123" });

    expect(page.hash()).toBe("#inbox/abc123");
    page.app.dispose();
  });

  it("leaves a page that has gone elsewhere where it is", () => {
    const page = mountGmail({ features: [navigate] });

    page.go(`${testSettings.signIn}/v3/signin/identifier`);
    page.bridge.push(gmailPushes.navigate, { hash: "#inbox/abc123" });

    expect(page.hash()).toBeUndefined();
    page.app.dispose();
  });
});

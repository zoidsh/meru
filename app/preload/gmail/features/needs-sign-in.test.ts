import { describe, expect, it } from "vitest";

import { gmail } from "../../../shared/channels/gmail.ts";
import { mountGmail, testSettings } from "../testing.ts";
import { needsSignIn } from "./needs-sign-in.ts";

describe(needsSignIn.id, () => {
  it("says so once for a page that landed on Google's sign-in", () => {
    const page = mountGmail({
      features: [needsSignIn],
      href: `${testSettings.signIn}/v3/signin/identifier`,
    });

    expect(page.bridge.sentOn(gmail.needsSignIn)).toStrictEqual([{}]);

    page.change({});
    expect(page.bridge.sentOn(gmail.needsSignIn)).toHaveLength(1);
    page.app.dispose();
  });

  it("says nothing for a page in the mailbox", () => {
    const page = mountGmail({ features: [needsSignIn] });

    expect(page.bridge.sentOn(gmail.needsSignIn)).toStrictEqual([]);
    page.app.dispose();
  });
});

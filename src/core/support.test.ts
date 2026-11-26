import { describe, expect, it } from "vitest";

import { isMailtoUrl } from "./mailto.ts";
import { SUPPORT_ADDRESS, supportMailto } from "./support.ts";

describe(supportMailto, () => {
  it("writes to support with the subject encoded, a link Meru composes", () => {
    const link = supportMailto("Meru Pro license & key?");

    expect(link).toBe(
      `mailto:${SUPPORT_ADDRESS}?subject=Meru%20Pro%20license%20%26%20key%3F`
    );
    expect(isMailtoUrl(link)).toBeTruthy();
  });
});

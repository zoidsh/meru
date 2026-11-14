import { describe, expect, it } from "vitest";

import { mountGmail } from "../testing.ts";
import { userStyles } from "./user-styles.ts";

describe(userStyles.id, () => {
  it("puts the user's own sheet up and follows a change to it", () => {
    const page = mountGmail({
      features: [userStyles],
      settings: { userStyles: ".aeF { max-width: 900px; }" },
    });

    expect(page.sheet("userStyles")).toBe(".aeF { max-width: 900px; }");

    page.change({ userStyles: ".aeF { max-width: 1200px; }" });
    expect(page.sheet("userStyles")).toBe(".aeF { max-width: 1200px; }");

    page.change({ userStyles: "" });
    expect(page.sheet("userStyles")).toBeUndefined();
    page.app.dispose();
  });
});

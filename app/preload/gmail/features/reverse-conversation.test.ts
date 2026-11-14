import { describe, expect, it } from "vitest";

import { gmail } from "../../../shared/channels/gmail.ts";
import { mountGmail, reached, stylesWith } from "../testing.ts";
import conversation from "./fixtures/conversation.html?raw";
import {
  reverseConversation,
  reverseConversationRules,
} from "./reverse-conversation.ts";

const mount = (now: () => number) =>
  mountGmail({
    features: [reverseConversation],
    grace: 1000,
    html: conversation,
    now,
    settings: { styles: stylesWith("reverseConversation") },
  });

describe(reverseConversation.id, () => {
  it("turns the message list around and takes the separators with it", () => {
    const page = mount(() => 0);

    expect(page.sheet("reverseConversation")).toContain(
      "flex-direction: column-reverse"
    );
    const found = reached(reverseConversationRules);
    expect(found.map((element) => element.getAttribute("role"))).toContain(
      "list"
    );
    expect(
      found
        .filter((element) => element.className === "G2")
        .map((element) => element.textContent?.trim())
    ).toStrictEqual(["Grace", "Alan"]);
    page.app.dispose();
  });

  it("reports the message header's class once it stops matching", async () => {
    let now = 0;
    const page = mount(() => now);
    page.run();
    expect(page.bridge.sentOn(gmail.selectorMiss)).toStrictEqual([]);

    now = 5000;
    for (const header of document.querySelectorAll(".Bk")) {
      header.remove();
    }
    await page.settle();

    expect(page.bridge.sentOn(gmail.selectorMiss)).toStrictEqual([
      { selector: "reverseConversation" },
    ]);
    page.app.dispose();
  });
});

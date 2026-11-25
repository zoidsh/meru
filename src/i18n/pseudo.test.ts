import { describe, expect, it } from "vitest";

import { pseudoMessages, pseudoText } from "./pseudo.ts";

describe(pseudoMessages, () => {
  it("accents the text of every message and keeps its placeholders", () => {
    expect(
      pseudoMessages({
        title: ["Settings"],
        named: ["Remove ", ["name"], "?"],
        counted: [
          [
            "count",
            "plural",
            { offset: undefined, one: ["# message"], other: ["# messages"] },
          ],
        ],
      })
    ).toStrictEqual({
      title: ["Séttíngs"],
      named: ["Rémóvé ", ["name"], "?"],
      counted: [
        [
          "count",
          "plural",
          { offset: undefined, one: ["# mésságé"], other: ["# mésságés"] },
        ],
      ],
    });
  });

  it("accents a message kept as plain text", () => {
    expect(pseudoText("Open at login")).toBe("Ópén át lógín");
  });
});

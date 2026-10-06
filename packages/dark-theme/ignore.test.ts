import { describe, expect, test } from "bun:test";
import { collectIgnoreAttributeNames, coversProperty } from "./ignore";

describe("collectIgnoreAttributeNames", () => {
  test("reads the attribute an ignore selector matches on", () => {
    expect(collectIgnoreAttributeNames(['[contenteditable="true"]'])).toEqual(["contenteditable"]);
  });

  test("reads every attribute of a compound selector, once", () => {
    expect(
      collectIgnoreAttributeNames([
        '.editor[contenteditable="true"][aria-hidden]',
        "[contenteditable]",
      ]),
    ).toEqual(["contenteditable", "aria-hidden"]);
  });

  test("ignores a selector with no attribute", () => {
    expect(collectIgnoreAttributeNames([".edeTZ", ".HM .I5"])).toEqual([]);
  });
});

describe("coversProperty", () => {
  test("a listed property is covered", () => {
    expect(coversProperty(["background-color"], "background-color")).toBe(true);
  });

  test("border-color covers each side", () => {
    expect(coversProperty(["border-color"], "border-top-color")).toBe(true);
  });

  test("an unlisted property is not covered", () => {
    expect(coversProperty(["border-color"], "background-color")).toBe(false);
  });
});

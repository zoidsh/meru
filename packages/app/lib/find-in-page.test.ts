import { describe, expect, test } from "bun:test";
import { readFindRequest } from "./find-in-page";

describe("readFindRequest", () => {
  test("text is a search", () => {
    expect(readFindRequest("out of office")).toEqual({ kind: "search", text: "out of office" });
  });

  test("clearing the text stops the find but is not a close", () => {
    expect(readFindRequest("")).toEqual({ kind: "clear" });
  });

  test("only null is a close, so only a close takes the keyboard back", () => {
    expect(readFindRequest(null)).toEqual({ kind: "close" });
  });

  test("a query of spaces is still a search", () => {
    expect(readFindRequest(" ")).toEqual({ kind: "search", text: " " });
  });
});

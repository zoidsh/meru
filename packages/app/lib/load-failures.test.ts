import { describe, expect, test } from "bun:test";
import { isLoadFailureWorthLogging } from "./load-failures";

describe("isLoadFailureWorthLogging", () => {
  test("skips a subframe that cancelled its own load", () => {
    expect(isLoadFailureWorthLogging(-3, false)).toBe(false);
  });

  test("keeps a main frame that aborted, which is the view going blank", () => {
    expect(isLoadFailureWorthLogging(-3, true)).toBe(true);
  });

  test("keeps every other subframe failure", () => {
    expect(isLoadFailureWorthLogging(-2, false)).toBe(true);
    expect(isLoadFailureWorthLogging(-105, false)).toBe(true);
  });
});

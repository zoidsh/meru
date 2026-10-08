import { describe, expect, test } from "bun:test";
import { filterTodo, promotedSubjects } from "./beta-rebase";

const todo = [
  "pick 1111111 # Feature A (#1)",
  "pick 2222222 # 3.64.0-beta.1",
  "pick 3333333 Feature B (#2)",
  "pick 4444444 3.64.0-beta.2",
  "",
  "# Rebase abc..def onto abc (4 commands)",
].join("\n");

describe("filterTodo", () => {
  test("drops beta version commits in either todo format", () => {
    expect(filterTodo(todo, new Set())).toBe(
      [
        "pick 1111111 # Feature A (#1)",
        "pick 3333333 Feature B (#2)",
        "",
        "# Rebase abc..def onto abc (4 commands)",
      ].join("\n"),
    );
  });

  test("drops commits whose subject landed on main", () => {
    expect(filterTodo(todo, new Set(["Feature A (#1)", "Fix X (#3)"]))).toBe(
      ["pick 3333333 Feature B (#2)", "", "# Rebase abc..def onto abc (4 commands)"].join("\n"),
    );
  });

  test("leaves a noop when every commit is dropped, so the rebase still moves onto main", () => {
    expect(filterTodo("pick 1111111 # 3.64.0-beta.1\n# comment", new Set())).toBe(
      "noop\n# comment",
    );
  });

  test("keeps a stable version subject, which is never a beta commit", () => {
    expect(filterTodo("pick 5555555 # 3.64.0", new Set())).toBe("pick 5555555 # 3.64.0");
  });
});

describe("promotedSubjects", () => {
  test("lists beta subjects that are also on main", () => {
    expect(
      promotedSubjects(["Feature B (#2)", "Feature A (#1)"], new Set(["Feature A (#1)"])),
    ).toEqual(["Feature A (#1)"]);
  });
});

import { describe, expect, test } from "bun:test";
import { filterTodo, promotedSubjects } from "./beta-rebase";

const subjects: Record<string, string> = {
  "1111111": "Feature A (#1)",
  "2222222": "3.64.0-beta.1",
  "3333333": "Feature B (#2)",
  "4444444": "3.64.0-beta.2",
  "5555555": "3.64.0",
};

function subjectOf(sha: string) {
  const subject = subjects[sha];

  if (subject === undefined) {
    throw new Error(`No commit ${sha}`);
  }

  return subject;
}

const comment = "# Rebase abc..def onto abc (4 commands)";

describe("filterTodo", () => {
  test("drops beta version commits in either default todo format", () => {
    const todo = [
      "pick 1111111 # Feature A (#1)",
      "pick 2222222 # 3.64.0-beta.1",
      "pick 3333333 Feature B (#2)",
      "pick 4444444 3.64.0-beta.2",
      "",
      comment,
    ].join("\n");

    expect(filterTodo(todo, new Set(), subjectOf)).toEqual({
      todo: ["pick 1111111 # Feature A (#1)", "pick 3333333 Feature B (#2)", "", comment].join(
        "\n",
      ),
      dropped: [
        { line: "pick 2222222 # 3.64.0-beta.1", reason: "beta version commit" },
        { line: "pick 4444444 3.64.0-beta.2", reason: "beta version commit" },
      ],
    });
  });

  test("drops commits whose subject landed on main", () => {
    const todo = ["pick 1111111 # Feature A (#1)", "pick 3333333 # Feature B (#2)"].join("\n");

    expect(filterTodo(todo, new Set(["Feature A (#1)", "Fix X (#3)"]), subjectOf)).toEqual({
      todo: "pick 3333333 # Feature B (#2)",
      dropped: [
        {
          line: "pick 1111111 # Feature A (#1)",
          reason: 'already on main as "Feature A (#1)"',
        },
      ],
    });
  });

  test("reads the subject from git under rebase.abbreviateCommands", () => {
    const todo = ["p 1111111 # Feature A (#1)", "p 2222222 # 3.64.0-beta.1"].join("\n");

    expect(filterTodo(todo, new Set(["Feature A (#1)"]), subjectOf).todo).toBe("noop");
  });

  test("reads the subject from git under a custom rebase.instructionFormat", () => {
    const todo = ["pick 1111111 Tim Cheung, 2 days ago", "pick 3333333 Tim Cheung, 1 day ago"].join(
      "\n",
    );

    expect(filterTodo(todo, new Set(["Feature A (#1)"]), subjectOf).todo).toBe(
      "pick 3333333 Tim Cheung, 1 day ago",
    );
  });

  test("fails on a line it does not recognise rather than keeping everything", () => {
    expect(() =>
      filterTodo("pick 1111111 # Feature A (#1)\nexec bun test", new Set(), subjectOf),
    ).toThrow("Unrecognised rebase todo line");
  });

  test("leaves a noop when every commit is dropped, so the rebase still moves onto main", () => {
    expect(filterTodo("pick 2222222 # 3.64.0-beta.1\n# comment", new Set(), subjectOf).todo).toBe(
      "noop\n# comment",
    );
  });

  test("keeps a stable version subject, which is never a beta commit", () => {
    expect(filterTodo("pick 5555555 # 3.64.0", new Set(), subjectOf).todo).toBe(
      "pick 5555555 # 3.64.0",
    );
  });
});

describe("promotedSubjects", () => {
  test("lists beta subjects that are also on main", () => {
    expect(
      promotedSubjects(["Feature B (#2)", "Feature A (#1)"], new Set(["Feature A (#1)"])),
    ).toEqual(["Feature A (#1)"]);
  });
});

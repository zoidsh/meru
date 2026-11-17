import { describe, expect, it } from "vitest";

import { firstWithUnread, totalUnread } from "./unread.ts";

describe(totalUnread, () => {
  it("adds every profile's count", () => {
    expect(totalUnread([3, 0, 120])).toBe(123);
  });

  it("counts nothing for a profile signed out or not yet polled", () => {
    expect(totalUnread([null, 2, null])).toBe(2);
    expect(totalUnread([null])).toBe(0);
  });

  it("is zero with no profiles", () => {
    expect(totalUnread([])).toBe(0);
  });
});

describe(firstWithUnread, () => {
  it("is the first profile, in order, with unread mail", () => {
    expect(
      firstWithUnread([
        { id: "a", unreadCount: 0 },
        { id: "b", unreadCount: null },
        { id: "c", unreadCount: 4 },
        { id: "d", unreadCount: 9 },
      ])?.id
    ).toBe("c");
  });

  it("is nothing when none has any", () => {
    expect(firstWithUnread([{ id: "a", unreadCount: 0 }])).toBeUndefined();
  });
});

import { describe, expect, test } from "bun:test";
import { mergeProps } from "@base-ui/react/merge-props";

/**
 * `ScrollArea` drops the `tabIndex` Base UI puts on a scrollable viewport by
 * passing `undefined` over it, which only works because `mergeProps` treats an
 * explicit `undefined` as a value rather than as nothing to merge. React then
 * leaves the attribute off and Chromium decides for itself whether the
 * scroller is a tab stop.
 */
describe("the merge the scroll area's tab index relies on", () => {
  test("an explicit undefined wins over the value under it", () => {
    const merged = mergeProps<"div">({ tabIndex: 0 }, { tabIndex: undefined });

    expect("tabIndex" in merged).toBe(true);
    expect(merged.tabIndex).toBeUndefined();
  });

  test("a key nobody later names is left as it was", () => {
    expect(mergeProps<"div">({ tabIndex: 0 }, {}).tabIndex).toBe(0);
  });
});

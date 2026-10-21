import { expect, test } from "bun:test";
import { curatedExtensions } from "@meru/shared/extensions";
import { extensionDescriptions } from "./extension-descriptions";

test("each translated extension description is the catalog's English", () => {
  const entries = Object.entries(extensionDescriptions);

  expect(entries.length).toBeGreaterThan(0);

  for (const [id, descriptor] of entries) {
    const extension = curatedExtensions.find((curated) => curated.id === id);

    expect(descriptor.message, id).toBe(extension?.description);
  }
});

import { expect, test } from "@playwright/test";

import { launch, runCommand, updateOf } from "./app.ts";

test("seeds the update state as idle and refuses a check in an unpackaged run", async () => {
  const { chrome, close } = await launch();
  try {
    await expect(updateOf(chrome)).resolves.toStrictEqual({ kind: "idle" });
    await expect(runCommand(chrome, "updater.check")).resolves.toStrictEqual({
      error: { kind: "failed", message: "notPackaged" },
      ok: false,
    });
  } finally {
    await close();
  }
});

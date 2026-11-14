import { runCommand } from "../scripts/lib/app.ts";
import { expect, test, updateOf } from "./app.ts";

test("seeds the update state as idle and refuses a check in an unpackaged run", async ({
  launch,
}) => {
  const { chrome } = await launch();
  await expect(updateOf(chrome)).resolves.toStrictEqual({ kind: "idle" });
  await expect(runCommand(chrome, "updater.check")).resolves.toStrictEqual({
    error: { kind: "failed", message: "notPackaged" },
    ok: false,
  });
});

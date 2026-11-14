import { profiles } from "../app/shared/channels/profiles.ts";
import { invokeIn } from "../scripts/lib/app.ts";
import { entitlementKindOf, expect, profilesOf, test } from "./app.ts";

test("creates a second profile under a trial", async ({ launch, stub }) => {
  const { app, chrome } = await launch({
    env: { MERU_ENTITLEMENT_URL: stub.url },
  });
  await expect.poll(async () => await entitlementKindOf(app)).toBe("trial");
  expect(
    await invokeIn(chrome, profiles.create, { label: "Work" })
  ).toMatchObject({ ok: true, value: { label: "Work", order: 1 } });
  const state = await profilesOf(chrome);
  expect(state.profiles.map((profile) => profile.label)).toStrictEqual([
    "Personal",
    "Work",
  ]);
});

test("opens the window where it was when the app last quit", async ({
  launch,
}) => {
  const placed = { height: 600, width: 900, x: 40, y: 80 };
  const first = await launch();
  const moved = await first.app.evaluate(({ BrowserWindow }, bounds) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.setBounds(bounds);
    return window?.getBounds();
  }, placed);
  await first.close();
  const second = await launch();
  const restored = await second.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.getBounds()
  );
  expect(restored).toStrictEqual(moved);
});

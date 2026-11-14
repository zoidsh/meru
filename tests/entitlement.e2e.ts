import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication } from "@playwright/test";
import { z } from "zod";

import { ENTITLEMENT_FILE } from "../app/main/features/entitlement/index.ts";
import { mintToken } from "../scripts/entitlement/sign.ts";
import { entitlementKindOf, entitlementOf, expect, test } from "./app.ts";

const PRO_KEY = "PRO-KEY-1";

// Only the fields the test reads or writes; the app parses the whole file.
const fileSchema = z.object({
  data: z.looseObject({
    deviceId: z.string(),
    licenseKey: z.string().nullable(),
    token: z.unknown(),
  }),
  version: z.number(),
});

const readState = async (userData: string) =>
  fileSchema.parse(
    JSON.parse(await readFile(path.join(userData, ENTITLEMENT_FILE), "utf-8"))
  );

const editState = async (
  userData: string,
  edit: (
    data: z.infer<typeof fileSchema>["data"]
  ) => z.infer<typeof fileSchema>["data"]
) => {
  const file = await readState(userData);
  await writeFile(
    path.join(userData, ENTITLEMENT_FILE),
    JSON.stringify({ ...file, data: edit(file.data) })
  );
};

test("holds the entitlement from a signed token, refreshed from the API and kept across launches", async ({
  launch,
  stub,
  userData,
}) => {
  test.setTimeout(90_000);
  stub.answer(PRO_KEY, { deviceLimit: 3, kind: "pro" });
  const run = async (
    url: string,
    check: (app: ElectronApplication) => Promise<void>
  ) => {
    const { app, close } = await launch({
      env: { MERU_ENTITLEMENT_URL: url },
    });
    await check(app);
    await close();
  };
  // A fresh install shows the window before the API answers, then a trial.
  stub.hold();
  await run(stub.url, async (app) => {
    await expect.poll(() => stub.requests.length).toBe(1);
    await expect.poll(async () => await entitlementKindOf(app)).toBe("unknown");
    stub.release();
    await expect.poll(async () => await entitlementKindOf(app)).toBe("trial");
    const entitlement = await entitlementOf(app);
    expect(entitlement).toMatchObject({ kind: "trial", source: "refreshed" });
  });
  const first = await readState(userData);
  const { deviceId } = first.data;
  expect(stub.requests).toStrictEqual([{ deviceId, licenseKey: null }]);

  // A token still valid starts the app with no network at all.
  await run("http://127.0.0.1:1/", async (app) => {
    await expect.poll(async () => await entitlementKindOf(app)).toBe("trial");
    const entitlement = await entitlementOf(app);
    expect(entitlement).toMatchObject({ kind: "trial", source: "stored" });
  });

  // A license key the token was not issued for is asked about at launch.
  await editState(userData, (data) => ({ ...data, licenseKey: PRO_KEY }));
  await run(stub.url, async (app) => {
    await expect
      .poll(async () => await entitlementKindOf(app))
      .toBe("licensed");
    const entitlement = await entitlementOf(app);
    expect(entitlement).toMatchObject({ kind: "licensed", plan: "pro" });
  });

  // An expired token is refreshed at launch, and a disabled answer flips the value.
  stub.answer(PRO_KEY, { kind: "disabled", reason: "refunded" });
  const expired = mintToken({
    deviceLimit: 3,
    exp: Math.floor(Date.now() / 1000) - 60,
    plan: "pro",
    status: "active",
    sub: deviceId,
    ttl: 10_800,
  });
  await editState(userData, (data) => ({
    ...data,
    token: { licenseKey: PRO_KEY, value: expired },
  }));
  await run(stub.url, async (app) => {
    await expect
      .poll(async () => await entitlementKindOf(app))
      .toBe("disabled");
    const entitlement = await entitlementOf(app);
    expect(entitlement).toMatchObject({
      kind: "disabled",
      reason: "refunded",
      source: "refreshed",
    });
  });
  expect(stub.requests.at(-1)).toStrictEqual({
    deviceId,
    licenseKey: PRO_KEY,
  });
});

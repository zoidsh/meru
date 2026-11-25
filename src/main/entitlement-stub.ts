// The entitlement API's stand-in for development and the end-to-end suite,
// imported only under `MERU_BUILD_MODE === "dev"` or `MERU_E2E_BUILD`, so no
// release holds it or trusts its key. Its key pair comes from a seed written
// here in the open: it signs nothing a release would accept, so it is no
// secret, and the build fails if the seed or the public key reaches a
// release.
import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto";

import { DAY, OFFLINE_GRACE } from "#core/entitlement.ts";
import type { Entitlement } from "#core/entitlement.ts";
import type {
  ServerAnswer,
  EntitlementServer,
} from "#platform/entitlement-server.ts";
import type { TextFile } from "#platform/text-file.ts";

const DEV_KEY_SEED = "meru development entitlement key, public by design";

/** The public half of the seed's key pair, raw, base64url. */
export const DEV_PUBLIC_KEY = "ubpt7-KnQIvden48nE3Ku1XnK8_6Xi0CqcSn1yvF-MI";

// An Ed25519 PKCS #8 key is this header and the 32-byte seed.
const PKCS8_ED25519_HEADER = "302e020100300506032b657004220420";

const devPrivateKey = () =>
  createPrivateKey({
    key: Buffer.concat([
      Buffer.from(PKCS8_ED25519_HEADER, "hex"),
      createHash("sha256").update(DEV_KEY_SEED).digest(),
    ]),
    format: "der",
    type: "pkcs8",
  });

/** Signs `payload` as the server would, with the development key. */
export const signDevToken = (payload: Entitlement) => {
  const bytes = Buffer.from(JSON.stringify(payload), "utf-8");

  return `${bytes.toString("base64url")}.${sign(null, bytes, devPrivateKey()).toString("base64url")}`;
};

const TRIAL_LENGTH = 14 * DAY;

/** A name of no meaning, as the server gives a device it activates. */
export const generatedDeviceName = () =>
  `Device ${randomBytes(2).toString("hex").toUpperCase()}`;

/** What the stand-in remembers, as the server would: the trial's start and the keys activated here. */
interface StubRecord {
  trialStartedAt?: number;
  licenses: Record<string, { deviceLabel: string }>;
}

const readRecord = async (file: TextFile): Promise<StubRecord> => {
  try {
    const parsed = JSON.parse(
      (await file.read()) ?? "{}"
    ) as Partial<StubRecord>;

    return {
      ...(typeof parsed.trialStartedAt === "number" && {
        trialStartedAt: parsed.trialStartedAt,
      }),
      licenses: parsed.licenses ?? {},
    };
  } catch {
    return { licenses: {} };
  }
};

/**
 * Answers as the entitlement API would, from a file of its own in the user
 * data folder, so a development profile's trial runs 14 days from its first
 * launch. A key of the right shape activates, except one that starts
 * `MERU-USED-`, which is at its device limit, and one that starts
 * `MERU-0000-`, which no license has. `offline` makes it answer nothing.
 */
export const createStubEntitlementServer = ({
  file,
  now,
  offline,
}: {
  file: TextFile;
  now: () => number;
  offline: () => boolean;
}): EntitlementServer => {
  const token = (
    deviceId: string,
    fields: Pick<Entitlement, "tier"> &
      Partial<
        Pick<Entitlement, "trialEndsAt" | "licensee" | "deviceLabel" | "reason">
      >
  ): ServerAnswer => {
    const issuedAt = now();

    return {
      token: signDevToken({
        v: 1,
        deviceId,
        issuedAt,
        expiresAt: issuedAt + OFFLINE_GRACE,
        ...fields,
      }),
    };
  };

  const licensed = (deviceId: string, deviceLabel: string) =>
    token(deviceId, { tier: "pro", licensee: "Meru Developer", deviceLabel });

  const answer = async (
    handle: (record: StubRecord) => ServerAnswer
  ): Promise<ServerAnswer> => {
    if (offline()) {
      return { error: "offline" };
    }

    const record = await readRecord(file);
    const result = handle(record);

    await file.write(`${JSON.stringify(record, undefined, 2)}\n`);

    return result;
  };

  return {
    refresh: ({ deviceId, licenseKey }) =>
      answer((record) => {
        if (licenseKey !== undefined) {
          const license = record.licenses[licenseKey];

          return license
            ? licensed(deviceId, license.deviceLabel)
            : token(deviceId, { tier: "free", reason: "licenseRefused" });
        }

        record.trialStartedAt ??= now();

        const trialEndsAt = record.trialStartedAt + TRIAL_LENGTH;

        return now() < trialEndsAt
          ? token(deviceId, { tier: "trial", trialEndsAt })
          : token(deviceId, { tier: "free", reason: "trialEnded" });
      }),
    activate: ({ deviceId, licenseKey }) =>
      answer((record) => {
        if (licenseKey.startsWith("MERU-USED-")) {
          return { error: "deviceLimit" };
        }

        if (licenseKey.startsWith("MERU-0000-")) {
          return { error: "invalidKey" };
        }

        const deviceLabel = generatedDeviceName();

        record.licenses[licenseKey] = { deviceLabel };

        return licensed(deviceId, deviceLabel);
      }),
    setDeviceLabel: ({ deviceId, licenseKey, deviceLabel }) =>
      answer((record) => {
        if (!record.licenses[licenseKey]) {
          return { error: "refused" };
        }

        record.licenses[licenseKey] = { deviceLabel };

        return licensed(deviceId, deviceLabel);
      }),
  };
};

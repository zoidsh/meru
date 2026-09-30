/*
 * electron-builder signs with whatever part of a signing environment it finds,
 * and skips what is missing with no more than a log line: without the
 * certificate it builds unsigned, without the Apple ID it skips notarisation,
 * and without the profile the Touch ID entitlement stops the app launching. A
 * partial set is therefore a mistake, and fails the build here.
 */
export const SIGNING_ENV_VARS = {
  mac: [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
    "APPLE_PROVISIONING_PROFILE",
  ],
  // The Azure SDK's EnvironmentCredential reads exactly these three names.
  win: ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"],
} as const;

/** Whether the platform's signing environment is set, throwing when only part of it is. */
export function hasSigningEnv(platform: keyof typeof SIGNING_ENV_VARS) {
  const names = SIGNING_ENV_VARS[platform];

  const missing = names.filter((name) => !process.env[name]);

  if (missing.length > 0 && missing.length < names.length) {
    throw new Error(
      `Only part of the ${platform} signing environment is set. Set all of ${names.join(", ")} or none; missing ${missing.join(", ")}.`,
    );
  }

  return missing.length === 0;
}

if (import.meta.main) {
  const platform = Bun.argv[2];

  if (platform !== "mac" && platform !== "win") {
    throw new Error("Usage: bun run scripts/signing-env.ts mac|win");
  }

  hasSigningEnv(platform);
}

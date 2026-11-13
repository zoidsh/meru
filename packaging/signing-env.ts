// electron-builder signs with whatever part of a signing environment it finds and skips the rest with a log line: without the certificate it builds unsigned, without the API key it skips notarisation. A partial set is therefore a mistake, and fails the build here.
export const SIGNING_ENV = {
  mac: [
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ],
  // The Azure SDK's EnvironmentCredential, which Artifact Signing authenticates through, reads exactly these three names.
  win: ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"],
} as const;

export type SigningPlatform = keyof typeof SIGNING_ENV;

/** Whether the platform's signing environment is set in full; throws when only part of it is. */
export const hasSigningEnv = (
  platform: SigningPlatform,
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean => {
  const names = SIGNING_ENV[platform];
  const missing = names.filter((name) => (env[name] ?? "") === "");
  if (missing.length > 0 && missing.length < names.length) {
    throw new Error(
      `Only part of the ${platform} signing environment is set. Set all of ${names.join(", ")} or none; missing ${missing.join(", ")}.`
    );
  }
  return missing.length === 0;
};

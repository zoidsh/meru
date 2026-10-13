import { rmSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// `codesign` never expands Xcode's `$(AppIdentifierPrefix)`, and macOS refuses to launch an app
// whose `keychain-access-groups` entitlement doesn't match the team it was signed with, so the
// group Touch ID WebAuthn credentials live under is written out here with the team id that only
// signed builds carry. Keep the group in sync with `configureWebAuthn` in `packages/app/index.ts`.
//
// `keychain-access-groups` is a restricted entitlement: Gatekeeper only honours it when the
// provisioning profile embedded in the app authorizes it, and the profile only binds to the app
// through the application and team identifiers below. `@electron/osx-sign` adds those two itself,
// but only for sandboxed apps, so they are written out here too.
export default async (context) => {
  if (context.packager.platform.name !== "mac") {
    return;
  }

  await writeProvisioningProfile(context.packager);

  await writeNotarizationKey();

  const buildPath = path.join(process.cwd(), "build");

  const template = await fs.readFile(
    path.join(buildPath, "entitlements.mac.template.plist"),
    "utf8",
  );

  const teamId = process.env.APPLE_TEAM_ID;

  const entitlements = teamId
    ? template.replace(
        "  </dict>",
        [
          "    <key>com.apple.application-identifier</key>",
          `    <string>${teamId}.${context.packager.appInfo.id}</string>`,
          "    <key>com.apple.developer.team-identifier</key>",
          `    <string>${teamId}</string>`,
          "    <key>keychain-access-groups</key>",
          "    <array>",
          `      <string>${teamId}.${context.packager.appInfo.id}.webauthn</string>`,
          "    </array>",
          "  </dict>",
        ].join("\n"),
      )
    : template;

  await fs.writeFile(path.join(buildPath, "entitlements.mac.plist"), entitlements);

  console.log(
    teamId
      ? "Generated macOS entitlements with the Touch ID keychain access group"
      : "Generated macOS entitlements without the Touch ID keychain access group, `APPLE_TEAM_ID` is unset",
  );
};

// The profile authorizes that keychain access group, and a signed app without it will not
// launch. electron-builder takes a profile only as a path, and the file is gitignored, so it is
// written from the base64 the signing environment carries. The environment is the only source: a
// file left by an earlier build may hold a profile that no longer lists the signing certificate.
async function writeProvisioningProfile(packager) {
  const profile = packager.platformSpecificBuildOptions.provisioningProfile;

  if (!profile) {
    return;
  }

  const profilePath = path.resolve(packager.projectDir, profile);

  const base64 = process.env.APPLE_PROVISIONING_PROFILE;

  if (!base64) {
    await fs.rm(profilePath, { force: true });

    return;
  }

  await fs.writeFile(profilePath, Buffer.from(base64, "base64"));

  console.log(`Wrote the provisioning profile to ${profile}`);
}

// notarytool takes the App Store Connect API key only as a path, while 1Password and GitHub hand
// over its contents, so the key is written to a private temporary file for the rest of the build
// and removed when the process exits, failed builds included. A path is used as given.
async function writeNotarizationKey() {
  const key = process.env.APPLE_API_KEY;

  if (!key?.startsWith("-----BEGIN")) {
    return;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "meru-notarization-"));

  const keyPath = path.join(dir, `AuthKey_${process.env.APPLE_API_KEY_ID}.p8`);

  await fs.writeFile(keyPath, key, { mode: 0o600 });

  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));

  process.env.APPLE_API_KEY = keyPath;

  console.log("Wrote the App Store Connect API key to a temporary file for notarisation");
}

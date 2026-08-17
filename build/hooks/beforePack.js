import fs from "node:fs/promises";
import path from "node:path";

// `codesign` never expands Xcode's `$(AppIdentifierPrefix)`, and macOS refuses to launch an app
// whose `keychain-access-groups` entitlement doesn't match the team it was signed with, so the
// group Touch ID WebAuthn credentials live under is written out here with the team id that only
// signed builds carry. Keep the group in sync with `configureWebAuthn` in `packages/app/index.ts`.
export default async (context) => {
  if (context.packager.platform.name !== "mac") {
    return;
  }

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

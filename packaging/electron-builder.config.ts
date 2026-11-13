import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Configuration } from "electron-builder";
import { z } from "zod";

import { writeNotarizationKey } from "./hooks.ts";
import { hasSigningEnv } from "./signing-env.ts";

const ARCHES: ("x64" | "arm64")[] = ["x64", "arm64"];

const SCHEMES = ["meru", "mailto", "http", "https"];

// A build for this machine names the checkout it came from, and the app keeps its user data there rather than in the directory an installed Meru, 3.x included, uses.
const localMarker = (): string | undefined => {
  if (process.env.MERU_LOCAL_PACKAGE !== "1") {
    return undefined;
  }
  const marker = path.join(import.meta.dirname, "out", "local-package");
  mkdirSync(path.dirname(marker), { recursive: true });
  writeFileSync(marker, path.resolve(import.meta.dirname, ".."));
  return marker;
};

const marker = localMarker();

// electron-builder looks for Electron in the project's node_modules, and the project is the workspace root, not the app.
const { description, devDependencies } = z
  .object({
    description: z.string(),
    devDependencies: z.object({ electron: z.string() }),
  })
  .parse(
    JSON.parse(
      readFileSync(
        path.join(import.meta.dirname, "..", "app", "package.json"),
        "utf-8"
      )
    )
  );

const config: Configuration = {
  appId: "sh.zoid.meru",
  appImage: {
    // electron-builder's default name drops the arch for x64.
    // oxlint-disable-next-line no-template-curly-in-string -- electron-builder expands these macros itself.
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  asarUnpack: [],
  beforePack: () => {
    writeNotarizationKey();
  },
  directories: {
    app: "app",
    buildResources: "packaging/assets",
    output: "packaging/out",
  },
  electronFuses: {
    enableCookieEncryption: false,
    enableEmbeddedAsarIntegrityValidation: true,
    enableNodeCliInspectArguments: false,
    enableNodeOptionsEnvironmentVariable: false,
    grantFileProtocolExtraPrivileges: true,
    onlyLoadAppFromAsar: true,
    resetAdHocDarwinSignature: true,
    runAsNode: false,
  },
  electronVersion: devDependencies.electron,
  // Main and the preloads are bundles, so nothing under node_modules is loaded at runtime.
  extraResources:
    marker === undefined ? [] : [{ from: marker, to: "local-package" }],
  files: ["dist/**", "!dist/**/*.map", "!node_modules/**"],
  linux: {
    category: "Network;Office",
    description,
    icon: "packaging/assets/icons/",
    synopsis: "The Gmail experience you deserve",
    target: [
      { arch: ARCHES, target: "AppImage" },
      { arch: ARCHES, target: "deb" },
      { arch: ARCHES, target: "rpm" },
    ],
  },
  mac: {
    category: "public.app-category.productivity",
    darkModeSupport: true,
    entitlements: "packaging/assets/entitlements.mac.plist",
    extendInfo: {
      CFBundleIconName: "AppIcon",
      CFBundleURLSchemes: SCHEMES,
      NSCameraUsageDescription:
        "Meru uses your camera for video calls in Google apps such as Meet and Chat.",
      NSMicrophoneUsageDescription:
        "Meru uses your microphone for calls and voice input in Google apps such as Meet and Chat.",
    },
    // CFBundleIconName names the icon in this compiled asset catalog, which electron-builder does not produce.
    extraResources: [{ from: "packaging/assets/Assets.car", to: "Assets.car" }],
    gatekeeperAssess: false,
    hardenedRuntime: true,
    icon: "packaging/assets/icon.icns",
    minimumSystemVersion: "13.0.0",
    // Notarises when APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER are set, and skips with a warning otherwise.
    notarize: true,
    target: { arch: ARCHES, target: "default" },
  },
  nsis: {
    allowToChangeInstallationDirectory: true,
    include: "packaging/assets/installer.nsh",
    oneClick: false,
    perMachine: false,
  },
  productName: "Meru",
  protocols: { name: "Meru", schemes: SCHEMES },
  publish: { provider: "github", releaseType: "release" },
  // Without the pin electron-builder 26 uses the FUSE2 runtime, and the AppImage needs libfuse.so.2 on the user's machine.
  toolsets: { appimage: "1.0.3" },
  win: {
    // electron-builder starts its Azure signing manager whenever this is set, and that needs Windows, or pwsh and wine, and fails without the credentials, so an unsigned build leaves it out.
    azureSignOptions: hasSigningEnv("win")
      ? {
          certificateProfileName: "zoid-public-trust",
          codeSigningAccountName: "zoid",
          endpoint: "https://neu.codesigning.azure.net",
          // electron-updater compares a downloaded installer's signer against this, so it has to be the certificate's subject exactly.
          publisherName: "CN=Zoid Ltd, O=Zoid Ltd, L=London, C=GB",
        }
      : null,
    icon: "packaging/assets/icon.ico",
    target: [
      { arch: ARCHES, target: "nsis" },
      { arch: ARCHES, target: "portable" },
    ],
    verifyUpdateCodeSignature: true,
  },
};

export default config;

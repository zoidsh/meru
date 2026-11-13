import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Configuration } from "electron-builder";

const ARCHES: ("x64" | "arm64")[] = ["x64", "arm64"];

const SCHEMES = ["meru", "mailto", "http", "https"];

// Playwright drives the app through the inspector, so the end-to-end suite's build keeps the CLI inspect arguments that a release turns off.
const e2eBuild = process.env.MERU_E2E_BUILD === "1";

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

const config: Configuration = {
  appId: "sh.zoid.meru",
  appImage: {
    // electron-builder's default name drops the arch for x64.
    // oxlint-disable-next-line no-template-curly-in-string -- electron-builder expands these macros itself.
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  asarUnpack: [],
  directories: {
    buildResources: "packaging/assets",
    output: "packaging/out",
  },
  electronFuses: {
    enableCookieEncryption: false,
    enableEmbeddedAsarIntegrityValidation: true,
    enableNodeCliInspectArguments: e2eBuild,
    enableNodeOptionsEnvironmentVariable: false,
    grantFileProtocolExtraPrivileges: true,
    onlyLoadAppFromAsar: true,
    resetAdHocDarwinSignature: true,
    runAsNode: false,
  },
  // Main and the preloads are bundles, so nothing under node_modules is loaded at runtime.
  extraResources:
    marker === undefined ? [] : [{ from: marker, to: "local-package" }],
  files: ["dist/**", "!dist/**/*.map", "static/**", "!node_modules/**"],
  linux: {
    category: "Network;Office",
    description:
      "Tired of losing your inbox in browser tabs? Meru brings Gmail to your fingertips as a desktop app",
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
    icon: "packaging/assets/icon.icns",
    minimumSystemVersion: "13.0.0",
    // signing: see docs
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
    icon: "packaging/assets/icon.ico",
    // signing: see docs
    target: [
      { arch: ARCHES, target: "nsis" },
      { arch: ARCHES, target: "portable" },
    ],
  },
};

export default config;

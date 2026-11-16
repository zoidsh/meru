import { copyFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { Configuration } from "electron-builder";

import { appIdentity } from "#core/app-identity.ts";

import manifest from "./package.json" with { type: "json" };

/**
 * `release` is what users install. `e2e` is the end-to-end suite's build: the
 * same app with the inspector arguments Playwright needs and the test-only
 * switches compiled in, packed from a folder of its own into one of its own,
 * so nothing that packs a release can pick it up.
 */
export type PackageVariant = "release" | "e2e";

const SCHEMES = ["meru", "mailto", "http", "https"];

const ARCHES: ("x64" | "arm64")[] = ["x64", "arm64"];

const root = import.meta.dirname;

/**
 * macOS 26 draws the icon from the compiled asset catalog that
 * `CFBundleIconName` names; `icon.icns` stays for older systems.
 */
const copyAssetCatalog: Configuration["afterPack"] = async (context) => {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const entries = await readdir(context.appOutDir);
  const bundle = entries.find((entry) => entry.endsWith(".app"));

  if (!bundle) {
    throw new Error(`No .app bundle in ${context.appOutDir}`);
  }

  await copyFile(
    path.join(root, "build", "Assets.car"),
    path.join(context.appOutDir, bundle, "Contents", "Resources", "Assets.car")
  );
};

export const packOutputDir = (variant: PackageVariant) =>
  path.join(root, "dist", variant);

export const createConfig = (variant: PackageVariant): Configuration => {
  const identity = appIdentity({
    version: manifest.version,
    isRelease: variant === "release",
  });
  // A development build claims no link or mail scheme, so the system never
  // hands it what the installed Meru should get.
  const schemes = identity.productName === "Meru" ? SCHEMES : [];

  return {
    ...identity,
    directories: {
      app: path.join(root, "out", variant === "e2e" ? "e2e" : "prod"),
      output: packOutputDir(variant),
      buildResources: path.join(root, "build"),
    },
    // The built app is complete: everything is bundled and it has no
    // node_modules, so there is nothing to install or rebuild.
    files: ["**/*", "!**/node_modules/**", "!**/*.map"],
    npmRebuild: false,
    nodeGypRebuild: false,
    asar: true,
    extraMetadata: {
      description:
        "Tired of losing your inbox in browser tabs? Meru brings Gmail to your fingertips as a desktop app",
      author: { name: "Tim Cheung", email: "tim@meru.so" },
      repository: "zoidsh/meru",
    },
    electronFuses: {
      runAsNode: false,
      // One-way: Chromium drops every cookie it cannot decrypt, so a downgrade
      // past a build with it on would sign every profile out of Gmail.
      enableCookieEncryption: false,
      enableNodeOptionsEnvironmentVariable: false,
      // `_electron.launch` passes `--inspect=0` and waits for the debugger.
      enableNodeCliInspectArguments: variant === "e2e",
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      // The renderer is served from `meru-app://`, never from `file://`.
      grantFileProtocolExtraPrivileges: false,
      // Flipping a fuse breaks the signature, and an unsigned arm64 app whose
      // signature is broken is killed at launch.
      resetAdHocDarwinSignature: true,
    },
    ...(schemes.length > 0 ? { protocols: { name: "Meru", schemes } } : {}),
    // Signing, notarisation and publishing are not configured yet, so every
    // build is unsigned whatever identities the keychain or environment holds.
    publish: null,
    afterPack: copyAssetCatalog,
    mac: {
      identity: null,
      category: "public.app-category.productivity",
      minimumSystemVersion: "13.0.0",
      icon: "build/icon.icns",
      darkModeSupport: true,
      target: { target: "default", arch: ARCHES },
      extendInfo: {
        CFBundleIconName: "AppIcon",
        ...(schemes.length > 0 ? { CFBundleURLSchemes: schemes } : {}),
        NSCameraUsageDescription:
          "Meru uses your camera for video calls in Google apps such as Meet and Chat.",
        NSMicrophoneUsageDescription:
          "Meru uses your microphone for calls and voice input in Google apps such as Meet and Chat.",
      },
    },
    win: {
      icon: "build/icon.ico",
      target: [
        { target: "nsis", arch: ARCHES },
        { target: "portable", arch: ARCHES },
      ],
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
    },
    linux: {
      icon: "build/icons/",
      target: [
        { target: "AppImage", arch: ARCHES },
        { target: "deb", arch: ARCHES },
        { target: "rpm", arch: ARCHES },
      ],
      synopsis: "The Gmail experience you deserve",
      description:
        "Tired of losing your inbox in browser tabs? Meru brings Gmail to your fingertips as a desktop app",
      category: "Network;Office",
    },
    appImage: {
      artifactName: "${productName}-${version}-${arch}.${ext}",
    },
    // This toolset's static runtime is what lets the AppImage run without FUSE.
    toolsets: { appimage: "1.0.3" },
  };
};

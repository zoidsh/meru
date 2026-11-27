import { copyFile, readdir } from "node:fs/promises";
import path from "node:path";

import { Arch } from "electron-builder";
import type { Configuration } from "electron-builder";

import { appIdentity } from "#core/app-identity.ts";

import manifest from "./package.json" with { type: "json" };
import {
  isSoundAddon,
  SOUND_ADDON_FOLDER,
  SOUND_ADDON_LICENSE,
  soundAddonGlob,
} from "./scripts/lib/bundles.ts";

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

/**
 * Fails a pack whose app holds anything but its own architecture's audio
 * addon, once, with its license beside it: a file set that matched nothing on
 * some target, or another platform's binaries, 46 MB of them, would otherwise
 * ship unnoticed.
 */
const checkSoundAddon: Configuration["afterPack"] = async (context) => {
  const arch = Arch[context.arch];
  const entries = await readdir(context.appOutDir, {
    recursive: true,
    withFileTypes: true,
  });
  const addons = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".node")
  );
  const found = addons.map((entry) => entry.name);
  const [addon] = addons;

  if (
    !addon ||
    addons.length !== 1 ||
    !isSoundAddon(addon.name, context.electronPlatformName, arch)
  ) {
    throw new Error(
      `The ${context.electronPlatformName} ${arch} app must hold its own audio addon alone, and holds ${found.length === 0 ? "no .node" : found.join(", ")}`
    );
  }

  const license = path.join(addon.parentPath, SOUND_ADDON_LICENSE);

  if (
    !entries.some(
      (entry) =>
        entry.isFile() && path.join(entry.parentPath, entry.name) === license
    )
  ) {
    throw new Error(
      `The ${context.electronPlatformName} ${arch} app must hold the audio addon's license at ${license}`
    );
  }
};

const afterPack: Configuration["afterPack"] = async (context) => {
  await checkSoundAddon(context);
  await copyAssetCatalog(context);
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
    // node_modules, so there is nothing to install or rebuild. Its one
    // native file, the audio addon, is the build machine's; each architecture
    // packed takes its own from the package instead, since the installers
    // pack x64 and arm64 from one build.
    files: [
      "**/*",
      "!**/node_modules/**",
      "!**/*.map",
      "!*.node",
      {
        from: SOUND_ADDON_FOLDER,
        to: ".",
        filter: [soundAddonGlob(process.platform, "${arch}")],
      },
      {
        from: SOUND_ADDON_FOLDER,
        to: path.dirname(SOUND_ADDON_LICENSE),
        filter: [path.basename(SOUND_ADDON_LICENSE)],
      },
    ],
    // A native file loads from disk, never from inside the archive; its
    // license sits beside it, where a person looking at the binary finds it.
    asarUnpack: ["**/*.node", `**/${SOUND_ADDON_LICENSE}`],
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
    afterPack,
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
    // Meru's sounds need PipeWire's client library, which the audio addon
    // links: recommended, never depended on, so a system without it still
    // installs Meru and only loses those sounds. Setting `recommends`
    // replaces electron-builder's default list, hence its tray library too;
    // `depends` stays electron-builder's. The rpm is left without one, since
    // fpm offers its weak dependencies only as a raw spec tag.
    deb: {
      recommends: ["libappindicator3-1", "libpipewire-0.3-0"],
    },
    appImage: {
      artifactName: "${productName}-${version}-${arch}.${ext}",
    },
    // This toolset's static runtime is what lets the AppImage run without FUSE.
    toolsets: { appimage: "1.0.3" },
  };
};

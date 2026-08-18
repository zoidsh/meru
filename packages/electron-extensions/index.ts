export type { ExtensionAction } from "./action";
export { registerExtensionBridgeScheme } from "./bridge/scheme";
export { compareExtensionVersions, verifyCrx } from "./crx";
export type { VerifiedCrx } from "./crx";
export { pruneDerivedExtensions } from "./derive";
export type { PruneDerivedExtensionsOptions } from "./derive";
export { Extensions } from "./extensions";
export type { ActionsChangedListener, ExtensionDirs, ExtensionsOptions } from "./extensions";
export {
  buildCrxDownloadUrl,
  buildUpdateCheckUrl,
  fetchCrx,
  fetchCrxUpdate,
  getInstalledExtension,
  installExtension,
  installLatestExtension,
  uninstallExtension,
} from "./install";
export type {
  CrxDownloadOptions,
  CrxUpdate,
  FetchCrxOptions,
  FetchCrxUpdateOptions,
  FetchImplementation,
  InstalledExtension,
  InstalledExtensionOptions,
  InstallExtensionOptions,
  InstallLatestExtensionOptions,
  LatestExtensionInstall,
  UpdateCheckOptions,
} from "./install";
export type { ExtensionsLogger } from "./logger";
export type { NativeMessagingHostPolicy } from "./native-messaging/native-messaging";
export { findExtensionDirs } from "./scan";

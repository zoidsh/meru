export type { ExtensionAction } from "./action";
export { registerExtensionBridgeScheme } from "./bridge/scheme";
export { compareExtensionVersions, verifyCrx } from "./crx";
export type { VerifiedCrx } from "./crx";
export { pruneDerivedExtensions } from "./derive";
export type { PruneDerivedExtensionsOptions } from "./derive";
export { isExtensionId } from "./derive/extension-id";
export { Extensions } from "./extensions";
export type {
  ActionsChangedListener,
  ExtensionDirs,
  ExtensionsOptions,
  SharedExtensionInstance,
} from "./extensions";
export {
  buildCrxDownloadUrl,
  buildUpdateCheckUrl,
  fetchCrx,
  fetchCrxUpdate,
  getInstalledExtension,
  installExtension,
  installLatestExtension,
  pruneExtensionVersions,
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
  PruneExtensionVersionsOptions,
  UpdateCheckOptions,
} from "./install";
export type { ExtensionsLogger } from "./logger";
export type { NativeMessagingHostPolicy } from "./native-messaging/native-messaging";
export { createSharedExtensionInstance } from "./runtime-proxy";
export type { CreateSharedExtensionInstanceOptions } from "./runtime-proxy";
export { findExtensionDirs } from "./scan";

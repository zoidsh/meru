/**
 * Whether a version is a build of the development branch, which carries a
 * `-dev` prerelease such as `4.0.0-dev.0`.
 */
export const isDevVersion = (version: string) =>
  /^\d+\.\d+\.\d+-dev(?:[.+]|$)/iu.test(version);

/**
 * The id the operating system knows a build by: the macOS bundle id, the
 * Windows AppUserModelId. A development build, packaged or not, takes one of
 * its own so that it is never taken for the installed Meru or its mail and
 * link handler.
 */
export const appIdFor = (
  appId: string,
  { version, isRelease }: { version: string; isRelease: boolean }
) => (isRelease && !isDevVersion(version) ? appId : `${appId}.dev`);

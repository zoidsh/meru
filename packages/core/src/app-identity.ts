const isDevVersion = (version: string) =>
  /^\d+\.\d+\.\d+-dev(?:[.+]|$)/iu.test(version);

/**
 * The name and id a build is known by. The name is the folder Electron keeps
 * user data in by default, so a development build never opens an installed
 * Meru's profiles; the id is the macOS bundle id and Windows AppUserModelId,
 * so the system never takes a development build for the installed Meru or
 * hands it Meru's links and mail. A beta is a release: it shares the
 * installed Meru's data, which the in-place upgrade from v3 depends on.
 */
export const appIdentity = ({
  version,
  isRelease,
}: {
  version: string;
  isRelease: boolean;
}) =>
  isRelease && !isDevVersion(version)
    ? { productName: "Meru", appId: "sh.zoid.meru" }
    : { productName: "Meru Dev", appId: "sh.zoid.meru.dev" };

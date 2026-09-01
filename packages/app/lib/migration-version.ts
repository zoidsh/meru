/**
 * The app version with any prerelease suffix dropped — `3.60.0-beta.1` becomes
 * `3.60.0` — for the `projectVersion` conf matches migration keys against.
 *
 * Semver excludes prereleases from a range, and conf passes no
 * `includePrerelease`, so a Beta build would otherwise miss every key in the
 * ladder and run no migration at all.
 */
export function resolveMigrationVersion(version: string) {
  return /^\d+\.\d+\.\d+/.exec(version)?.[0] ?? version;
}

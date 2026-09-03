/**
 * The oldest macOS an update may be offered on. Electron 44 follows Chromium in
 * dropping macOS 12 (Monterey), so every build from that version on refuses to
 * launch below Ventura. A later Electron cutting another macOS is a one-line
 * change here.
 */
const MINIMUM_MACOS_VERSION = "13.0.0";

/**
 * Compares two dotted numeric version strings, answering the sign of `a - b`.
 *
 * Both sides here are known shapes — a constant written above, and Chromium's
 * `major.minor.bugfix` operating system version — so this deliberately does no
 * semver parsing. `semver` is not a dependency of this package, and declaring
 * one does not share the copy electron-updater already bundles: bun keeps that
 * one nested under `electron-updater/node_modules`, and hoisting shifts around
 * the new declaration rather than deduplicating against it. Measured on a clean
 * install, `bun add -d semver` took the semver copies in `app.js` from three to
 * nine and the file from 1300226 to 1351836 bytes, against the 1302528 budget
 * in `tests/bundle-budget.json`. Pinning the declared copy to
 * electron-updater's exact 7.7.2 deduplicated nothing.
 *
 * Anything that does not parse answers `0`, so an unrecognized version reads as
 * equal and the caller lets the update through. Failing open is what
 * electron-updater's own check does, and the alternative is stranding a user on
 * an old build because a version string surprised us.
 */
function compareVersions(a: string, b: string) {
  // A missing component is zero, so `13.1` and `13.1.0` compare equal, but an
  // empty or non-numeric one is not: `Number("")` is `0`, which would read an
  // empty version as older than everything and refuse every update.
  const parsePart = (part: string | undefined) =>
    part === undefined ? 0 : /^\d+$/.test(part) ? Number(part) : Number.NaN;

  const left = a.split(".");
  const right = b.split(".");

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftPart = parsePart(left[index]);
    const rightPart = parsePart(right[index]);

    if (Number.isNaN(leftPart) || Number.isNaN(rightPart)) {
      return 0;
    }

    if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }

  return 0;
}

/**
 * Whether an update may be offered to a machine running `systemVersion` on
 * `platform`.
 *
 * This is version-based rather than manifest-based on purpose. electron-updater
 * has a gate of its own, reading `minimumSystemVersion` off the update feed —
 * but electron-builder writes that field only into the app's `Info.plist` and a
 * `pkg` target's requirements, never into `latest-mac.yml`, so it arrives
 * undefined. Even given the field, that gate compares against `os.release()`,
 * which on macOS is the Darwin version: Monterey reports 21.x, which is above
 * any macOS product version we could put there. So the check has to be made
 * here, against `process.getSystemVersion()`, which is the product version.
 *
 * Without it a Monterey machine downloads and installs a build macOS then
 * refuses to open, and the working version it was on is already gone.
 */
export function isUpdateSupported(platform: string, systemVersion: string) {
  if (platform !== "darwin") {
    return true;
  }

  return compareVersions(systemVersion, MINIMUM_MACOS_VERSION) >= 0;
}

import type { Config } from "@meru/shared/types";

/**
 * The name electron-updater resolves a stable feed under — `latest-mac.yml`,
 * `latest-linux.yml`, `latest.yml` — and what its providers fall back to when
 * no channel is set.
 *
 * Naming it is what makes leaving Experimental work. `autoUpdater.channel`
 * refuses anything but a non-empty string once a channel has been assigned, so
 * a session that visited Experimental cannot be handed `null` to get back to
 * stable: the setter throws `ERR_UPDATER_INVALID_CHANNEL` out of the
 * configuration listener, and the properties after it never get applied.
 *
 * It also makes the stable feed independent of the build asking for it. Unset,
 * the GitHub provider falls through to the channel baked into the build's
 * `app-update.yml`, which on an Experimental build is `alpha` — so a user
 * stepping back to stable would ask a stable release for `alpha-mac.yml` and
 * get a 404 with no fallback.
 */
const STABLE_CHANNEL_NAME = "latest";

/**
 * The `autoUpdater` properties the configured channel decides, in the order
 * they have to be assigned: the channel setter force-enables `allowDowngrade`,
 * so what this returns for it only survives if it is written afterwards.
 *
 * `allowDowngrade` is what carries a user off a prerelease the moment they
 * leave the channel, rather than leaving them there until a stable overtakes
 * the version they are on.
 */
export function resolveUpdateChannel(
  channel: Config["updates.channel"],
  currentVersion: { prerelease: readonly (string | number)[] },
) {
  const isStable = channel === "stable";

  return {
    channel: isStable ? STABLE_CHANNEL_NAME : channel,
    allowPrerelease: !isStable,
    allowDowngrade: isStable && currentVersion.prerelease.length > 0,
  };
}

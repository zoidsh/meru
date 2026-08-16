function readVersionComponent(component: string | undefined) {
  const value = Number(component);

  return Number.isFinite(value) ? value : 0;
}

/**
 * Chrome's order over extension versions: dot-separated numbers compared
 * component by component, a missing component counting as zero, so `1.2` and
 * `1.2.0` are the same version and `2` is newer than `1.9`. Negative when the
 * first version is older, zero when they are the same, positive when it is
 * newer.
 *
 * What an update check compares is a version an unpacked install carries
 * against one the update endpoint offers, and neither is a semver range, so
 * comparing them the way Chrome does is the whole job.
 */
export function compareExtensionVersions(version: string, otherVersion: string) {
  const components = version.split(".");

  const otherComponents = otherVersion.split(".");

  const componentCount = Math.max(components.length, otherComponents.length);

  for (let index = 0; index < componentCount; index += 1) {
    const difference =
      readVersionComponent(components[index]) - readVersionComponent(otherComponents[index]);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

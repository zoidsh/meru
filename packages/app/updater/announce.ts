export function shouldAnnounceUpdate(lastAnnouncedVersion: string | null, version: string) {
  return version !== lastAnnouncedVersion;
}

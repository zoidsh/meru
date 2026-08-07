import { type SupportedWorkspaceApp, workspaceApps } from "./workspace-apps";

export function getWorkspaceAppUrl(app: SupportedWorkspaceApp) {
  return workspaceApps[app].url ?? `https://${app}.google.com`;
}

const GOOGLE_HOSTNAMES = ["google.com", "googleusercontent.com"];

export function isGoogleUrl(url: string) {
  let hostname: string;

  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  return GOOGLE_HOSTNAMES.some(
    (googleHostname) => hostname === googleHostname || hostname.endsWith(`.${googleHostname}`),
  );
}

export function getGoogleDomainFaviconUrl(domain: string, size: number) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

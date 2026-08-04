import { type SupportedWorkspaceApp, workspaceApps } from "./types";

export function getWorkspaceAppUrl(app: SupportedWorkspaceApp) {
  return workspaceApps[app].url ?? `https://${app}.google.com`;
}

export function getGoogleDomainFaviconUrl(domain: string, size: number) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

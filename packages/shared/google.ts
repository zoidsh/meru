import type { GoogleAppsPinnedApp } from "./types";

export function getGoogleAppUrl(app: GoogleAppsPinnedApp) {
  return `https://${app}.google.com`;
}

export function getGoogleDomainFaviconUrl(domain: string, size: number) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

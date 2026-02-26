import type { GoogleAppsPinnedApp } from "./types";

export function getGoogleAppUrl(app: GoogleAppsPinnedApp) {
  return `https://${app}.google.com`;
}

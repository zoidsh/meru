// Google ad/tracker hostnames harvested from EasyList and EasyPrivacy — the only
// list rules that can fire against the Gmail traffic Meru renders. Blocking a host
// also blocks its subdomains (see isBlockedHost in ./index.ts).

export const GOOGLE_AD_HOSTS: string[] = [
  "doubleclick.net",
  "doubleclick.com",
  "googlesyndication.com",
  "googleadservices.com",
  "googletagservices.com",
  "2mdn.net",
  "admob.com",
  "adtrafficquality.google",
  "mail-ads.google.com",
];

export const GOOGLE_TRACKER_HOSTS: string[] = [
  "google-analytics.com",
  "googletagmanager.com",
  "getgoogletagmanager.com",
];

export function isBlockedHost(hostname: string, blockedHosts: Set<string>) {
  let domain = hostname;

  while (domain.includes(".")) {
    if (blockedHosts.has(domain)) {
      return true;
    }

    domain = domain.slice(domain.indexOf(".") + 1);
  }

  return false;
}

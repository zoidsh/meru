import { type SupportedWorkspaceApp, workspaceApps } from "./workspace-apps";

export function getWorkspaceAppUrl(app: SupportedWorkspaceApp) {
  return workspaceApps[app].url ?? `https://${app}.google.com`;
}

export function getGoogleDomainFaviconUrl(domain: string, size: number) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

/**
 * Subdomains Google has moved an app off. Each one still redirects to the app's
 * current home, so a link to one — an old bookmark, a message sent before the
 * move — has to keep resolving to the app that answers it.
 */
const legacyWorkspaceAppSubdomains: Record<string, SupportedWorkspaceApp> = {
  notebooklm: "notebook",
};

const workspaceAppsBySubdomain = new Map<string, SupportedWorkspaceApp>([
  ...(Object.keys(workspaceApps) as SupportedWorkspaceApp[]).map(
    (workspaceApp) =>
      [
        new URL(getWorkspaceAppUrl(workspaceApp)).hostname.replace(".google.com", ""),
        workspaceApp,
      ] as const,
  ),
  ...Object.entries(legacyWorkspaceAppSubdomains),
]);

const WORKSPACE_APPS_SUBDOMAIN_REGEXP = new RegExp(
  `(${Array.from(workspaceAppsBySubdomain.keys()).join("|")})(?:\\.usercontent)?\\.google\\.com`,
);

/**
 * Docs, Sheets, Slides and Forms all share the `docs.google.com` host — their
 * own subdomains only redirect there — so the leading path segment is the only
 * thing telling them apart. Anything else on that host stays Docs.
 */
const workspaceAppsByDocsPathSegment: Record<string, SupportedWorkspaceApp> = {
  document: "docs",
  spreadsheets: "sheets",
  presentation: "slides",
  forms: "forms",
};

const WORKSPACE_APPS_DOCS_PATH_REGEXP = new RegExp(
  `docs\\.google\\.com/(?:(?:u/\\d+|a/[^/]+)/)?(${Object.keys(workspaceAppsByDocsPathSegment).join("|")})(?:[/?#]|$)`,
);

export function getWorkspaceAppFromUrl(url: string) {
  const docsPathSegment = url.match(WORKSPACE_APPS_DOCS_PATH_REGEXP)?.[1];

  if (docsPathSegment) {
    return workspaceAppsByDocsPathSegment[docsPathSegment];
  }

  const workspaceAppSubdomain = url.match(WORKSPACE_APPS_SUBDOMAIN_REGEXP)?.[1];

  if (!workspaceAppSubdomain) {
    return undefined;
  }

  return workspaceAppsBySubdomain.get(workspaceAppSubdomain);
}

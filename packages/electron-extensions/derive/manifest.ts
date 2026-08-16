export type ExtensionManifest = {
  name?: string;
  version?: string;
  key?: string;
  background?: {
    service_worker?: string;
    type?: string;
  };
  content_security_policy?: {
    extension_pages?: string;
    sandbox?: string;
  };
};

export type DerivedManifest = {
  manifest: ExtensionManifest;
  serviceWorkerWrapper: string | null;
};

/**
 * A service worker that pulls in the facade before the extension's own
 * background script. Static imports are the only vehicle: `import()` is banned
 * in service workers, and a script injected any other way runs too late or, on
 * Electron 43, not at all (see the injection-vehicle notes in the feature doc).
 */
function createServiceWorkerWrapper(
  facadeFileName: string,
  backgroundFileName: string,
  isModule: boolean,
) {
  const header =
    "// Generated when the extension was derived, in place of its own service worker.\n";

  if (isModule) {
    return `${header}import "./${facadeFileName}";\nimport "./${backgroundFileName}";\n`;
  }

  return `${header}importScripts("/${facadeFileName}", "/${backgroundFileName}");\n`;
}

function parseDirectives(contentSecurityPolicy: string) {
  return contentSecurityPolicy
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean);
}

function findDirective(directives: string[], name: string) {
  return directives.findIndex((directive) => new RegExp(`^${name}(\\s|$)`, "i").test(directive));
}

/**
 * Widens `connect-src` so the facade can reach the bridge. An extension's own
 * policy governs its service worker as much as its pages, and one that pins
 * `connect-src` — 1Password pins it to its own hosts — would otherwise block
 * the only transport extension contexts have into the main process.
 *
 * Only `connect-src` moves, and only by this one scheme: what the extension
 * may load, execute or frame is left exactly as its author wrote it.
 */
export function allowConnectSource(contentSecurityPolicy: string, source: string) {
  const directives = parseDirectives(contentSecurityPolicy);

  const connectIndex = findDirective(directives, "connect-src");

  if (connectIndex !== -1) {
    const connectDirective = directives[connectIndex] as string;

    if (connectDirective.split(/\s+/).includes(source)) {
      return contentSecurityPolicy;
    }

    directives[connectIndex] = `${connectDirective} ${source}`;

    return directives.join("; ");
  }

  const defaultIndex = findDirective(directives, "default-src");

  // Without either directive nothing restricts connections in the first place
  if (defaultIndex === -1) {
    return contentSecurityPolicy;
  }

  const inheritedSources = (directives[defaultIndex] as string)
    .split(/\s+/)
    .slice(1)
    // `'none'` alongside another source is ignored rather than obeyed
    .filter((inheritedSource) => inheritedSource !== "'none'");

  directives.push(`connect-src ${[...inheritedSources, source].join(" ")}`);

  return directives.join("; ");
}

function deriveContentSecurityPolicy(
  manifest: ExtensionManifest,
  bridgeConnectSource: string,
): ExtensionManifest["content_security_policy"] {
  const extensionPages = manifest.content_security_policy?.extension_pages;

  if (!extensionPages) {
    return manifest.content_security_policy;
  }

  return {
    ...manifest.content_security_policy,
    extension_pages: allowConnectSource(extensionPages, bridgeConnectSource),
  };
}

/**
 * Points the manifest's service worker at a generated wrapper and lets its
 * content security policy reach the native messaging bridge. Everything else is
 * carried over untouched — `key` above all, since without it Chromium derives
 * the extension id from the directory it was loaded from and the derived copy
 * would answer to a different id than the extension it came from.
 */
export function deriveManifest(
  manifest: ExtensionManifest,
  {
    facadeFileName,
    serviceWorkerFileName,
    bridgeConnectSource,
  }: {
    facadeFileName: string;
    serviceWorkerFileName: string;
    bridgeConnectSource: string;
  },
): DerivedManifest {
  const derivedManifest: ExtensionManifest = {
    ...manifest,
    content_security_policy: deriveContentSecurityPolicy(manifest, bridgeConnectSource),
  };

  const backgroundFileName = manifest.background?.service_worker?.replace(/^\//, "");

  if (!backgroundFileName) {
    return { manifest: derivedManifest, serviceWorkerWrapper: null };
  }

  return {
    manifest: {
      ...derivedManifest,
      background: { ...manifest.background, service_worker: serviceWorkerFileName },
    },
    serviceWorkerWrapper: createServiceWorkerWrapper(
      facadeFileName,
      backgroundFileName,
      manifest.background?.type === "module",
    ),
  };
}

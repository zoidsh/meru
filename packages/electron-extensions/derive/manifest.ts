export type ExtensionManifest = {
  name?: string;
  version?: string;
  key?: string;
  background?: {
    service_worker?: string;
    type?: string;
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

/**
 * Points the manifest's service worker at a generated wrapper. Everything else
 * is carried over untouched — `key` above all, since without it Chromium
 * derives the extension id from the directory it was loaded from and the
 * derived copy would answer to a different id than the extension it came from.
 */
export function deriveManifest(
  manifest: ExtensionManifest,
  {
    facadeFileName,
    serviceWorkerFileName,
  }: {
    facadeFileName: string;
    serviceWorkerFileName: string;
  },
): DerivedManifest {
  const backgroundFileName = manifest.background?.service_worker?.replace(/^\//, "");

  if (!backgroundFileName) {
    return { manifest, serviceWorkerWrapper: null };
  }

  return {
    manifest: {
      ...manifest,
      background: { ...manifest.background, service_worker: serviceWorkerFileName },
    },
    serviceWorkerWrapper: createServiceWorkerWrapper(
      facadeFileName,
      backgroundFileName,
      manifest.background?.type === "module",
    ),
  };
}

import { describe, expect, test } from "bun:test";
import { deriveManifest } from "./manifest";

const fileNames = {
  facadeFileName: "chrome-facade.js",
  serviceWorkerFileName: "chrome-facade-service-worker.js",
};

describe("deriveManifest", () => {
  test("points the service worker at a wrapper importing the facade first", () => {
    const { manifest, serviceWorkerWrapper } = deriveManifest(
      {
        name: "1Password",
        background: { service_worker: "background/background.js", type: "module" },
      },
      fileNames,
    );

    expect(manifest.background).toEqual({
      service_worker: "chrome-facade-service-worker.js",
      type: "module",
    });
    expect(serviceWorkerWrapper).toContain('import "./chrome-facade.js";');
    expect(serviceWorkerWrapper).toContain('import "./background/background.js";');
    expect(serviceWorkerWrapper?.indexOf("chrome-facade.js")).toBeLessThan(
      serviceWorkerWrapper?.indexOf("background/background.js") ?? 0,
    );
  });

  test("imports with importScripts when the service worker is not a module", () => {
    const { serviceWorkerWrapper } = deriveManifest(
      { background: { service_worker: "background.js" } },
      fileNames,
    );

    expect(serviceWorkerWrapper).toContain('importScripts("/chrome-facade.js", "/background.js");');
  });

  test("keeps the key so the extension id stays the one it was installed as", () => {
    const { manifest } = deriveManifest(
      { key: "MIIBIjANBgkq", background: { service_worker: "background.js" } },
      fileNames,
    );

    expect(manifest.key).toBe("MIIBIjANBgkq");
  });

  test("leaves the source manifest alone", () => {
    const sourceManifest = {
      background: { service_worker: "background.js", type: "module" },
    };

    deriveManifest(sourceManifest, fileNames);

    expect(sourceManifest.background.service_worker).toBe("background.js");
  });

  test("writes no wrapper for a manifest without a service worker", () => {
    const { manifest, serviceWorkerWrapper } = deriveManifest({ name: "No background" }, fileNames);

    expect(serviceWorkerWrapper).toBeNull();
    expect(manifest.background).toBeUndefined();
  });
});

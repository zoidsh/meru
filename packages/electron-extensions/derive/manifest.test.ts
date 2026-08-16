import { describe, expect, test } from "bun:test";
import { allowConnectSource, deriveManifest } from "./manifest";

const fileNames = {
  facadeFileName: "chrome-facade.js",
  serviceWorkerFileName: "chrome-facade-service-worker.js",
  bridgeConnectSource: "extension-native-messaging:",
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

  test("lets the content security policy reach the bridge", () => {
    const { manifest } = deriveManifest(
      {
        content_security_policy: {
          extension_pages: "default-src 'none'; connect-src https://1password.com",
          sandbox: "sandbox allow-scripts",
        },
      },
      fileNames,
    );

    expect(manifest.content_security_policy).toEqual({
      extension_pages:
        "default-src 'none'; connect-src https://1password.com extension-native-messaging:",
      sandbox: "sandbox allow-scripts",
    });
  });

  test("leaves a manifest without a content security policy alone", () => {
    const { manifest } = deriveManifest({ name: "No policy" }, fileNames);

    expect(manifest.content_security_policy).toBeUndefined();
  });
});

describe("allowConnectSource", () => {
  const source = "extension-native-messaging:";

  test("appends to an existing connect-src", () => {
    expect(allowConnectSource("script-src 'self'; connect-src https://a.test", source)).toBe(
      "script-src 'self'; connect-src https://a.test extension-native-messaging:",
    );
  });

  test("adds nothing twice", () => {
    const contentSecurityPolicy = `connect-src https://a.test ${source}`;

    expect(allowConnectSource(contentSecurityPolicy, source)).toBe(contentSecurityPolicy);
  });

  test("derives connect-src from default-src, dropping 'none'", () => {
    expect(allowConnectSource("default-src 'none'; script-src 'self'", source)).toBe(
      "default-src 'none'; script-src 'self'; connect-src extension-native-messaging:",
    );
  });

  test("carries the other default-src sources over", () => {
    expect(allowConnectSource("default-src 'self' https://a.test", source)).toBe(
      "default-src 'self' https://a.test; connect-src 'self' https://a.test extension-native-messaging:",
    );
  });

  test("leaves a policy that restricts neither alone", () => {
    expect(allowConnectSource("script-src 'self'; object-src 'self'", source)).toBe(
      "script-src 'self'; object-src 'self'",
    );
  });
});
